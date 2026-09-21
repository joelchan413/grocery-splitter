import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Household, Trip } from '@/types';

// Global Event Emitter and in-memory DB attached to globalThis to persist across Next.js route bundles
const globalForDb = globalThis as unknown as {
  memoryDb?: DatabaseSchema;
  tripEvents?: EventEmitter;
};

class TripEventEmitter extends EventEmitter {}
export const tripEvents = globalForDb.tripEvents || new TripEventEmitter();
tripEvents.setMaxListeners(100);
if (!globalForDb.tripEvents) {
  globalForDb.tripEvents = tripEvents;
}

export interface DatabaseSchema {
  household: Household;
  activeTripId: string | null;
  trips: Record<string, Trip>;
  history: Trip[];
}

const DEFAULT_HOUSEHOLD: Household = {
  id: 'household-default',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#7C3AED', venmoHandle: '@jordan' },
  ],
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDatabase(): DatabaseSchema {
  if (globalForDb.memoryDb) return globalForDb.memoryDb;

  ensureDataDir();

  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      household: DEFAULT_HOUSEHOLD,
      activeTripId: null,
      trips: {},
      history: [],
    };
    saveDatabase(initial);
    globalForDb.memoryDb = initial;
    return globalForDb.memoryDb;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    globalForDb.memoryDb = JSON.parse(raw);
    return globalForDb.memoryDb!;
  } catch (err) {
    console.error('Error reading database file, resetting to default:', err);
    const fallback: DatabaseSchema = {
      household: DEFAULT_HOUSEHOLD,
      activeTripId: null,
      trips: {},
      history: [],
    };
    saveDatabase(fallback);
    globalForDb.memoryDb = fallback;
    return globalForDb.memoryDb;
  }
}

export function saveDatabase(data: DatabaseSchema): void {
  globalForDb.memoryDb = data;
  ensureDataDir();
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, DB_FILE);
    } catch {
      // Fallback if atomic rename fails (e.g. cross-device mount in Docker or Windows file lock)
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  } catch (err) {
    console.error('Error writing database file:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
  }
}

// ----------------- Helper CRUD Functions -----------------

export function getHousehold(): Household {
  const db = getDatabase();
  return db.household;
}

export function updateHousehold(household: Household): Household {
  const db = getDatabase();
  db.household = household;
  saveDatabase(db);
  tripEvents.emit('household-updated', household);
  return household;
}

export function getTrip(tripId: string): Trip | null {
  const db = getDatabase();
  return db.trips[tripId] || null;
}

export function getActiveTrip(): Trip | null {
  const db = getDatabase();
  if (!db.activeTripId) return null;
  return db.trips[db.activeTripId] || null;
}

export function saveTrip(trip: Trip): Trip {
  const db = getDatabase();
  const tripToSave: Trip = {
    ...trip,
    updatedAt: trip.updatedAt || new Date().toISOString(),
  };
  db.trips[tripToSave.id] = tripToSave;
  db.activeTripId = tripToSave.id;
  
  const histIdx = db.history.findIndex((t) => t.id === tripToSave.id);
  if (histIdx >= 0) {
    db.history[histIdx] = tripToSave;
  } else {
    db.history.unshift(tripToSave);
  }

  saveDatabase(db);
  tripEvents.emit(`trip-updated:${tripToSave.id}`, tripToSave);
  tripEvents.emit('history-updated', db.history);
  return tripToSave;
}

export function updateTripPartial(tripId: string, updates: Partial<Trip>): Trip | null {
  const db = getDatabase();
  const existing = db.trips[tripId];

  // If trip does not exist on server, but updates provides a valid trip object, upsert it!
  const updated: Trip = existing
    ? {
        ...existing,
        ...updates,
      }
    : (updates as Trip);

  if (!updated || !updated.id) return null;

  updated.updatedAt = new Date().toISOString();

  db.trips[tripId] = updated;
  db.activeTripId = tripId;
  
  const histIdx = db.history.findIndex((t) => t.id === tripId);
  if (histIdx >= 0) {
    db.history[histIdx] = updated;
  } else {
    db.history.unshift(updated);
  }

  saveDatabase(db);
  tripEvents.emit(`trip-updated:${tripId}`, updated);
  tripEvents.emit('history-updated', db.history);
  return updated;
}

export function archiveTrip(tripId: string): Trip | null {
  const db = getDatabase();
  const trip = db.trips[tripId];
  if (!trip) return null;

  trip.status = 'settled';
  const histIdx = db.history.findIndex((t) => t.id === tripId);
  if (histIdx >= 0) {
    db.history[histIdx] = trip;
  } else {
    db.history.unshift(trip);
  }

  if (db.activeTripId === tripId) {
    db.activeTripId = null;
  }

  saveDatabase(db);
  tripEvents.emit(`trip-updated:${tripId}`, trip);
  tripEvents.emit('history-updated', db.history);
  return trip;
}

export function getTripHistory(): Trip[] {
  const db = getDatabase();
  return db.history;
}
