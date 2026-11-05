import { Household, Trip } from '@/types';
import { sortTripHistory, summarizeTrip } from '@/lib/trip-history';
import { cacheTrip, loadCachedTrip, type CacheTripOptions } from '@/lib/trip-cache';
import { nextTripTimestamp } from '@/lib/trip-sync';
import { sanitizePaidShares, type PaidShares } from '@/lib/payments';

export const DEFAULT_HOUSEHOLD: Household = {
  id: 'household-default',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#DB2777', venmoHandle: '@jordan' },
  ],
};

const STORAGE_KEYS = {
  HOUSEHOLD: 'grocery_splitter_household_v1',
  HOUSEHOLD_INITIALIZED: 'grocery_splitter_household_init_v1',
  ACTIVE_TRIP: 'grocery_splitter_active_trip_v1',
  TRIP_HISTORY: 'grocery_splitter_trip_history_v1',
  ACTIVE_PARTICIPANT_ID: 'grocery_splitter_active_participant_v1',
  HIDDEN_TRIP_IDS: 'grocery_splitter_hidden_trips_v1',
  PAID_SHARES: 'grocery_splitter_paid_shares_v1',
};

export function isHouseholdInitialized(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(localStorage.getItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED));
}

export function setHouseholdInitialized(val: boolean = true): void {
  if (typeof window === 'undefined') return;
  if (val) {
    localStorage.setItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED);
  }
}

export function loadHousehold(): Household {
  if (typeof window === 'undefined') return DEFAULT_HOUSEHOLD;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HOUSEHOLD);
    if (!raw) return DEFAULT_HOUSEHOLD;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading household from localStorage:', e);
    return DEFAULT_HOUSEHOLD;
  }
}

export function saveHousehold(household: Household): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.HOUSEHOLD, JSON.stringify(household));
  } catch (e) {
    console.error('Error saving household to localStorage:', e);
  }
}

export async function loadActiveTrip(): Promise<Trip | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP);
    if (!raw) return null;
    const trip: Trip = JSON.parse(raw);
    return trip.receiptImagesOmitted ? await loadCachedTrip(trip.id) : trip;
  } catch (e) {
    console.error('Error loading active trip:', e);
    return null;
  }
}

let activeSave = 0;
export function saveActiveTrip(trip: Trip | null, options: CacheTripOptions = {}): void {
  if (typeof window === 'undefined') return;
  const save = ++activeSave;
  try {
    if (!trip) { localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP); return; }
    // Publish the pointer only after the complete offline copy is durable. A
    // pending photo write must never resurrect a trip after New trip or Archive.
    void cacheTrip(trip, options).then(() => {
      if (save === activeSave) localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP, JSON.stringify(summarizeTrip(trip)));
    }).catch((error) => console.error('Error saving active trip:', error));
  } catch (e) {
    console.error('Error saving active trip:', e);
  }
}

let latestHistory: Trip[] | undefined;
let historyRaw: string | null | undefined;

export function loadTripHistory(): Trip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY);
    if (raw !== historyRaw) {
      latestHistory = raw ? JSON.parse(raw) : [];
      historyRaw = raw;
    }
    return latestHistory ?? [];
  } catch (e) {
    console.error('Error loading trip history:', e);
    return [];
  }
}

let historySave = 0;
let migrationRaw: string | null | undefined;
let legacyTrips: Trip[] = [];
export function saveTripHistory(history: Trip[]): void {
  if (typeof window === 'undefined') return;
  const save = ++historySave;
  latestHistory = history;
  try {
    historyRaw = localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY);
    if (historyRaw !== migrationRaw) {
      const persisted: Trip[] = historyRaw ? JSON.parse(historyRaw) : [];
      legacyTrips = persisted.filter((trip) => !trip.receiptImagesOmitted);
      migrationRaw = historyRaw;
    }
    // A later server refresh may contain only summaries. It must still preserve
    // any embedded legacy photos until their IndexedDB migration has succeeded.
    const migrate = legacyTrips.map(async (trip) => {
      const cached = await loadCachedTrip(trip.id);
      if (!cached || getTripTimestamp(trip) > getTripTimestamp(cached)) await cacheTrip(trip);
    });
    void Promise.all(migrate).then(() => Promise.all(history.filter((trip) => !trip.receiptImagesOmitted).map((trip) => cacheTrip(trip)))).then(() => {
      if (save === historySave) {
        // Another tab can finish a save while this tab waits for IndexedDB.
        // Merge again at publication rather than replacing that tab's history.
        const current: Trip[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY) || '[]');
        const summaries = mergeTripHistory(current, history.map(summarizeTrip)).map(summarizeTrip);
        const raw = JSON.stringify(summaries);
        localStorage.setItem(STORAGE_KEYS.TRIP_HISTORY, raw);
        historyRaw = migrationRaw = raw;
        legacyTrips = [];
        latestHistory = summaries;
      }
    }).catch((error) => console.error('Error saving trip history:', error));
  } catch (error) {
    console.error('Error saving trip history:', error);
  }
}

export function getTripTimestamp(trip: Partial<Trip>): number {
  const timeStr = trip.updatedAt || trip.createdAt || trip.date;
  if (!timeStr) return 0;
  const t = new Date(timeStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function mergeTripHistory(localHistory: Trip[], incomingHistory: Trip[]): Trip[] {
  const map = new Map<string, Trip>();

  for (const trip of incomingHistory || []) {
    if (trip && trip.id) {
      map.set(trip.id, trip);
    }
  }

  for (const localTrip of localHistory || []) {
    if (!localTrip || !localTrip.id) continue;
    const existing = map.get(localTrip.id);
    if (!existing) {
      map.set(localTrip.id, localTrip);
    } else {
      const localTime = getTripTimestamp(localTrip);
      const incomingTime = getTripTimestamp(existing);
      if (localTime > incomingTime) {
        map.set(localTrip.id, localTrip);
      }
    }
  }

  return sortTripHistory(Array.from(map.values()));
}

export function addOrUpdateTripHistory(trip: Trip): Trip[] {
  if (typeof window === 'undefined') return [];
  try {
    const history = loadTripHistory();
    const updated = mergeTripHistory(history, [trip]);
    saveTripHistory(updated);
    return updated;
  } catch (e) {
    console.error('Error updating trip history:', e);
    return loadTripHistory();
  }
}

export function archiveTrip(trip: Trip): Trip[] {
  const previous = loadTripHistory().find((entry) => entry.id === trip.id);
  const latest = previous && getTripTimestamp(previous) > getTripTimestamp(trip) ? previous : trip;
  const archived: Trip = { ...trip, status: 'settled', updatedAt: nextTripTimestamp(latest) };
  // Archiving is an explicit user edit, so a superseded clock-ahead revision
  // must not prevent the settled snapshot from becoming the offline copy.
  void cacheTrip(archived, { authoritative: true }).catch((error) => console.error('Error caching archived trip:', error));
  return addOrUpdateTripHistory(archived);
}

/**
 * Trips hidden on this device. Kept apart from the trips themselves so the shared
 * server data is never modified and hiding survives history syncs.
 */
export function loadHiddenTripIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HIDDEN_TRIP_IDS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (e) {
    console.error('Error loading hidden trips:', e);
    return [];
  }
}

export function saveHiddenTripIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.HIDDEN_TRIP_IDS, JSON.stringify(ids));
  } catch (e) {
    console.error('Error saving hidden trips:', e);
  }
}

/** A local copy of who has paid back which trip, kept apart from the trips for the same reason. */
export function loadPaidShares(): PaidShares {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAID_SHARES);
    return sanitizePaidShares(raw ? JSON.parse(raw) : {});
  } catch (e) {
    console.error('Error loading payments:', e);
    return {};
  }
}

export function savePaidShares(paid: PaidShares): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.PAID_SHARES, JSON.stringify(paid));
  } catch (e) {
    console.error('Error saving payments:', e);
  }
}

export function loadActiveParticipantId(): string {
  if (typeof window === 'undefined') return 'p1';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PARTICIPANT_ID) || 'p1';
}

export function saveActiveParticipantId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PARTICIPANT_ID, id);
}
