import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { createHash } from 'node:crypto';
import { Household, Trip } from '@/types';
import { sortTripHistory } from '@/lib/trip-history';
import { clearSharesPaid, recordSharesPaid, sanitizePaidShares, type PaidShares, type ShareRef, type SharePayment } from '@/lib/payments';
import { sanitizeNotificationState, type NotificationState } from '@/lib/notification-rules';
import { removeSubscriptions, sanitizeSubscriptions, upsertSubscription, type PushSubscriptionRecord } from '@/lib/push-subscriptions';
import { sanitizeFoodTrackerState, type FoodTrackerState } from '@/lib/food-tracker';

// Global Event Emitter and in-memory DB attached to globalThis to persist across Next.js route bundles
const globalForDb = globalThis as unknown as {
  memoryDb?: DatabaseSchema;
  tripEvents?: EventEmitter;
  storageVersion?: number;
  photoRefs?: WeakMap<string[], string>;
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
  // Optional so databases written before trip hiding existed still load unchanged.
  hiddenTripIds?: string[];
  // How much each roommate has paid back on each trip, in cents. Optional for the same reason.
  paidShares?: PaidShares;
  // Devices that get push notifications, and which notifications have been sent. Optional for the same reason.
  pushSubscriptions?: PushSubscriptionRecord[];
  notificationState?: NotificationState;
  // Trips logged to one roommate's food spreadsheet. Optional for the same reason.
  foodTracker?: FoodTrackerState;
}

const DEFAULT_HOUSEHOLD: Household = {
  id: 'household-default',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#DB2777', venmoHandle: '@jordan' },
  ],
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PHOTO_DIR = path.join(DATA_DIR, 'receipt-photos');
const LEGACY_BACKUP = path.join(DATA_DIR, 'database.v1-backup.json');
const photoRefs = globalForDb.photoRefs ??= new WeakMap<string[], string>();

interface StoredTrip extends Omit<Trip, 'receiptImages'> {
  receiptImages?: string[];
  receiptImagesRef?: string;
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function atomicWrite(file: string, contents: string, durable = false): void {
  const temp = `${file}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(temp, contents, 'utf-8');
    if (durable) {
      const fd = fs.openSync(temp, 'r');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    fs.renameSync(temp, file);
    if (durable) syncDirectory(path.dirname(file));
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

// Immutable, content-addressed files are committed before database.json refers to
// them. Failed metadata writes can leave an unreferenced photo, never a broken
// pointer in the previously committed database. Photo bytes are unchanged.
function storeTripPhotos(trip: Trip): StoredTrip {
  // Storage references are private to this layer, never accepted from API data.
  const clean: StoredTrip = { ...trip };
  delete clean.receiptImagesRef;
  if (trip.receiptImages != null && (!Array.isArray(trip.receiptImages) || !trip.receiptImages.every((image) => typeof image === 'string'))) {
    throw new Error('Invalid receipt photos');
  }
  if (!trip.receiptImages?.length) return clean;
  let ref = photoRefs.get(trip.receiptImages);
  if (!ref) {
    const encoded = JSON.stringify(trip.receiptImages);
    ref = createHash('sha256').update(encoded).digest('hex');
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    const file = path.join(PHOTO_DIR, `${ref}.json`);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== encoded) {
      // Persist the directory entry, file data, then the photo's final name
      // before database.json is allowed to reference it.
      syncDirectory(DATA_DIR);
      atomicWrite(file, encoded, true);
    }
    photoRefs.set(trip.receiptImages, ref);
  }
  const stored: StoredTrip = { ...clean, receiptImagesRef: ref };
  delete stored.receiptImages;
  return stored;
}

function restoreTripPhotos(stored: StoredTrip, loaded: Map<string, string[]>): Trip {
  const { receiptImagesRef: ref, ...trip } = stored;
  if (!ref) return trip as Trip;
  if (!/^[a-f0-9]{64}$/.test(ref)) throw new Error('Invalid receipt photo reference');
  let images = loaded.get(ref);
  if (!images) {
    const encoded = fs.readFileSync(path.join(PHOTO_DIR, `${ref}.json`), 'utf-8');
    if (createHash('sha256').update(encoded).digest('hex') !== ref) throw new Error('Receipt photo file is damaged');
    const parsed: unknown = JSON.parse(encoded);
    if (!Array.isArray(parsed) || !parsed.every((image) => typeof image === 'string')) throw new Error('Invalid receipt photos');
    images = parsed;
    loaded.set(ref, images);
    photoRefs.set(images, ref);
  }
  return { ...trip, receiptImages: images };
}

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
    const stored = JSON.parse(raw);
    if (stored.storageVersion != null && stored.storageVersion !== 2) throw new Error('Unsupported database storage version');
    const loaded = new Map<string, string[]>();
    const { storageVersion, ...metadata } = stored;
    const database: DatabaseSchema = storageVersion === 2 ? {
      ...metadata,
      trips: Object.fromEntries(Object.entries(stored.trips as Record<string, StoredTrip>).map(([id, trip]) => [id, restoreTripPhotos(trip, loaded)])),
      history: (stored.history as StoredTrip[]).map((trip) => restoreTripPhotos(trip, loaded)),
    } : metadata;
    globalForDb.storageVersion = storageVersion ?? 1;
    globalForDb.memoryDb = database;
    return database;
  } catch (err) {
    console.error('Error reading database file:', err);
    throw err;
  }
}

export function saveDatabase(data: DatabaseSchema): void {
  ensureDataDir();
  try {
    // Keep the original embedded-photo database intact before the first migration.
    if (globalForDb.storageVersion !== 2 && fs.existsSync(DB_FILE) && !fs.existsSync(LEGACY_BACKUP)) {
      fs.copyFileSync(DB_FILE, LEGACY_BACKUP, fs.constants.COPYFILE_EXCL);
    }
    const storedTrips = new Map<Trip, StoredTrip>();
    const store = (trip: Trip) => {
      let stored = storedTrips.get(trip);
      if (!stored) { stored = storeTripPhotos(trip); storedTrips.set(trip, stored); }
      return stored;
    };
    atomicWrite(DB_FILE, JSON.stringify({
      ...data,
      storageVersion: 2,
      trips: Object.fromEntries(Object.entries(data.trips).map(([id, trip]) => [id, store(trip)])),
      history: data.history.map(store),
    }));
    globalForDb.memoryDb = data;
    globalForDb.storageVersion = 2;
  } catch (err) {
    console.error('Error writing database file:', err);
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
  const before = db.trips[trip.id] ?? null;
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
  tripEvents.emit('trip-saved', before, tripToSave);
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
  tripEvents.emit('trip-saved', existing ?? null, updated);
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
  return sortTripHistory(db.history);
}

export function getHiddenTripIds(): string[] {
  return [...(getDatabase().hiddenTripIds ?? [])];
}

/** Hides or unhides a trip for the whole household. Idempotent; the trip itself is never modified. */
export function setTripHidden(tripId: string, hidden: boolean): string[] {
  const db = getDatabase();
  const current = db.hiddenTripIds ?? [];
  const next = hidden
    ? current.includes(tripId) ? current : [...current, tripId]
    : current.filter((id) => id !== tripId);
  if (next.length === current.length && next.every((id, index) => id === current[index])) return [...current];

  saveDatabase({ ...db, hiddenTripIds: next });
  tripEvents.emit('hidden-updated', next);
  return [...next];
}

export function getPaidShares(): PaidShares {
  return sanitizePaidShares(getDatabase().paidShares);
}

export class UnknownShareError extends Error {}
export class UnknownRoommateError extends Error {}

/**
 * Applies a change to the household's payment record.
 * Every trip and roommate must exist, so the record can't fill up with ids nothing refers to.
 * Idempotent; trips are never modified.
 */
function updatePaidShares(shares: readonly ShareRef[], change: (current: PaidShares) => PaidShares): PaidShares {
  const db = getDatabase();
  const roommates = new Set(db.household.participants.map((p) => p.id));
  const unknown = shares.find((s) => !Object.hasOwn(db.trips, s.tripId) || !roommates.has(s.participantId));
  if (unknown) throw new UnknownShareError(`Unknown trip or roommate: ${unknown.tripId}/${unknown.participantId}`);

  const current = sanitizePaidShares(db.paidShares);
  const next = change(current);
  if (JSON.stringify(next) === JSON.stringify(current)) return current;

  saveDatabase({ ...db, paidShares: next });
  tripEvents.emit('payments-updated', next);
  tripEvents.emit('payments-saved', current, next);
  return next;
}

/** Records roommates as having paid back the given amounts. Recording again replaces the amount. */
export function recordPayments(payments: readonly SharePayment[]): PaidShares {
  return updatePaidShares(payments, (current) => recordSharesPaid(current, payments));
}

/** Marks shares as unpaid again. */
export function clearPayments(shares: readonly ShareRef[]): PaidShares {
  return updatePaidShares(shares, (current) => clearSharesPaid(current, shares));
}

// ----------------- Push notifications -----------------

export function getPushSubscriptions(): PushSubscriptionRecord[] {
  return sanitizeSubscriptions(getDatabase().pushSubscriptions);
}

/** Subscribes a device for a roommate, or moves it to them. Unknown roommates are refused. */
export function savePushSubscription(record: PushSubscriptionRecord): void {
  const db = getDatabase();
  if (!db.household.participants.some((p) => p.id === record.participantId)) {
    throw new UnknownRoommateError(`Unknown roommate: ${record.participantId}`);
  }
  saveDatabase({ ...db, pushSubscriptions: upsertSubscription(sanitizeSubscriptions(db.pushSubscriptions), record) });
}

export function removePushSubscriptions(endpoints: readonly string[]): void {
  const db = getDatabase();
  const current = sanitizeSubscriptions(db.pushSubscriptions);
  const next = removeSubscriptions(current, endpoints);
  if (next.length !== current.length) saveDatabase({ ...db, pushSubscriptions: next });
}

export function getNotificationState(): NotificationState {
  return sanitizeNotificationState(getDatabase().notificationState);
}

/** Records which notifications were sent. Runs synchronously, so two changes can't interleave. */
export function updateNotificationState(change: (current: NotificationState) => NotificationState): NotificationState {
  const db = getDatabase();
  const next = change(sanitizeNotificationState(db.notificationState));
  saveDatabase({ ...db, notificationState: next });
  return next;
}

export function getFoodTrackerState(): FoodTrackerState {
  return sanitizeFoodTrackerState(getDatabase().foodTracker);
}

/** Records which trips were logged to the food spreadsheet. Runs synchronously, so two changes can't interleave. */
export function updateFoodTrackerState(change: (current: FoodTrackerState) => FoodTrackerState): FoodTrackerState {
  const db = getDatabase();
  const next = change(sanitizeFoodTrackerState(db.foodTracker));
  saveDatabase({ ...db, foodTracker: next });
  return next;
}
