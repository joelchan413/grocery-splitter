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
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    globalForDb.memoryDb = JSON.parse(raw);
    return globalForDb.memoryDb!;
  } catch (err) {
    console.error('Error reading database file:', err);
    throw err;
  }
}

export function saveDatabase(data: DatabaseSchema): void {
  ensureDataDir();
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
    globalForDb.memoryDb = data;
  } catch (err) {
    console.error('Error writing database file:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
    throw err;
  }
}

// ----------------- Helper CRUD Functions -----------------

export function getHousehold(): Household {
  const db = getDatabase();
  return db.household;
}

export function updateHousehold(household: Household): Household {
  const db = getDatabase();
  saveDatabase({ ...db, household });
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

function upsertHistory(history: Trip[], trip: Trip): Trip[] {
  const index = history.findIndex((item) => item.id === trip.id);
  if (index === -1) return [trip, ...history];
  return history.map((item, itemIndex) => itemIndex === index ? trip : item);
}

export function saveTrip(trip: Trip): Trip {
  const db = getDatabase();
  const tripToSave: Trip = {
    ...trip,
    updatedAt: trip.updatedAt || new Date().toISOString(),
  };
  const history = upsertHistory(db.history, tripToSave);
  saveDatabase({
    ...db,
    trips: { ...db.trips, [tripToSave.id]: tripToSave },
    activeTripId: tripToSave.id,
    history,
  });
  tripEvents.emit(`trip-updated:${tripToSave.id}`, tripToSave);
  tripEvents.emit('history-updated', history);
  return tripToSave;
}

export function updateTripPartial(tripId: string, updates: Partial<Trip>): Trip | null {
  const db = getDatabase();
  const existing = db.trips[tripId];

  // If trip does not exist on server, but updates provides a valid trip object, upsert it!
  const updated: Trip = {
    ...(existing || (updates as Trip)),
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (!updated || !updated.id) return null;

  const history = upsertHistory(db.history, updated);
  saveDatabase({
    ...db,
    trips: { ...db.trips, [tripId]: updated },
    activeTripId: tripId,
    history,
  });
  tripEvents.emit(`trip-updated:${tripId}`, updated);
  tripEvents.emit('history-updated', history);
  return updated;
}

export function archiveTrip(tripId: string): Trip | null {
  const db = getDatabase();
  const trip = db.trips[tripId];
  if (!trip) return null;

  const archived = { ...trip, status: 'settled' as const };
  const history = upsertHistory(db.history, archived);

  saveDatabase({
    ...db,
    trips: { ...db.trips, [tripId]: archived },
    activeTripId: db.activeTripId === tripId ? null : db.activeTripId,
    history,
  });
  tripEvents.emit(`trip-updated:${tripId}`, archived);
  tripEvents.emit('history-updated', history);
  return archived;
}

export function getTripHistory(): Trip[] {
  const db = getDatabase();
  return db.history;
}
