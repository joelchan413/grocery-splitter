import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Household, Trip } from '@/types';

// Global Event Emitter for broadcasting real-time updates across SSE connections
class TripEventEmitter extends EventEmitter {}
export const tripEvents = new TripEventEmitter();
tripEvents.setMaxListeners(100);

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

// In-memory cache for fast read/write
let memoryDb: DatabaseSchema | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDatabase(): DatabaseSchema {
  if (memoryDb) return memoryDb;

  ensureDataDir();

  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      household: DEFAULT_HOUSEHOLD,
      activeTripId: null,
      trips: {},
      history: [],
    };
    saveDatabase(initial);
    memoryDb = initial;
    return memoryDb;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    memoryDb = JSON.parse(raw);
    return memoryDb!;
  } catch (err) {
    console.error('Error reading database file, resetting to default:', err);
    const fallback: DatabaseSchema = {
      household: DEFAULT_HOUSEHOLD,
      activeTripId: null,
      trips: {},
      history: [],
    };
    saveDatabase(fallback);
    memoryDb = fallback;
    return memoryDb;
  }
}

export function saveDatabase(data: DatabaseSchema): void {
  memoryDb = data;
  ensureDataDir();
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
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
  db.trips[trip.id] = trip;
  db.activeTripId = trip.id;
  
  const histIdx = db.history.findIndex((t) => t.id === trip.id);
  if (histIdx >= 0) {
    db.history[histIdx] = trip;
  } else {
    db.history.unshift(trip);
  }

  saveDatabase(db);
  tripEvents.emit(`trip-updated:${trip.id}`, trip);
  tripEvents.emit('history-updated', db.history);
  return trip;
}

export function updateTripPartial(tripId: string, updates: Partial<Trip>): Trip | null {
  const db = getDatabase();
  const existing = db.trips[tripId];
  if (!existing) return null;

  const updated: Trip = {
    ...existing,
    ...updates,
  };

  db.trips[tripId] = updated;
  
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
