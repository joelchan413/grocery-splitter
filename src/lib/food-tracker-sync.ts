import type { Trip } from '@/types';
import type { PaidShares } from '@/lib/payments';
import {
  findTrackedParticipant,
  foodTrackerRow,
  isTripFullyPaid,
  rowKey,
  type FoodTrackerRow,
} from '@/lib/food-tracker';
import {
  getDatabase,
  getFoodTrackerState,
  getHiddenTripIds,
  getPaidShares,
  getTrip,
  tripEvents,
  updateFoodTrackerState,
} from '@/lib/server-db';

/**
 * Sends a roommate's share of each fully paid trip to their food spreadsheet in Google Drive, through a
 * Google Apps Script web app that runs as them (see scripts/food-tracker.gs). Off unless configured.
 * Server only: started once from instrumentation.
 */

interface Config {
  url: string;
  secret: string;
  participant: string;
}

/** Claims and payments change one tap at a time; wait for them to stop before logging. */
const SETTLE_MS = 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i;

function readConfig(): Config | null {
  const url = process.env.FOOD_TRACKER_URL?.trim();
  const secret = process.env.FOOD_TRACKER_SECRET?.trim();
  const participant = process.env.FOOD_TRACKER_PARTICIPANT?.trim();
  return url && secret && participant ? { url, secret, participant } : null;
}

function rowFor(trip: Trip, config: Config): FoodTrackerRow | null {
  const db = getDatabase();
  const person = findTrackedParticipant(db.household, config.participant);
  if (!person || !isTripFullyPaid(trip, db.household, getPaidShares(), getHiddenTripIds())) return null;
  return foodTrackerRow(trip, db.household, person);
}

async function post(config: Config, row: FoodTrackerRow, images: readonly string[]): Promise<void> {
  const photos = images.flatMap((image, i) => {
    const match = DATA_URL.exec(image);
    return match ? [{ name: row.fileNames[i], mimeType: match[1].toLowerCase(), data: match[2] }] : [];
  });
  // Apps Script answers a POST with a redirect to the result, which fetch follows as a GET.
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: config.secret, row, photos }),
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let result: { ok?: boolean; error?: string } | null = null;
  try { result = JSON.parse(text); } catch { /* Apps Script errors come back as an HTML page */ }
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? `HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
}

// One trip at a time, so a save and a payment arriving together can't log the same trip twice.
let queue: Promise<void> = Promise.resolve();

function logTrip(config: Config, tripId: string): void {
  queue = queue.then(async () => {
    const trip = getTrip(tripId);
    if (!trip) return;
    const row = rowFor(trip, config);
    if (!row) return;
    const entry = getFoodTrackerState().logged[tripId];
    const key = rowKey(row);
    if (entry && ('skipped' in entry || entry.row === key)) return;
    try {
      await post(config, row, trip.receiptImages ?? []);
    } catch (err) {
      console.error(`Food tracker: couldn't log ${trip.storeName || tripId}, will retry within the hour:`, err instanceof Error ? err.message : err);
      return;
    }
    updateFoodTrackerState((state) => ({ ...state, logged: { ...state.logged, [tripId]: { row: key, loggedAt: new Date().toISOString() } } }));
    console.log(`Food tracker: logged ${row.store} (${row.date}), food $${row.food.toFixed(2)}.`);
  }).catch((err) => console.error('Food tracker failed:', err));
}

function debounced(check: (tripId: string) => void) {
  const timers = new Map<string, NodeJS.Timeout>();
  return (tripId: string) => {
    clearTimeout(timers.get(tripId));
    const timer = setTimeout(() => { timers.delete(tripId); check(tripId); }, SETTLE_MS);
    timer.unref?.();
    timers.set(tripId, timer);
  };
}

/** Trips already paid when logging is first turned on were most likely logged by hand, so they are skipped. */
function skipTripsAlreadyPaid(config: Config): void {
  if (getFoodTrackerState().startedAt) return;
  const db = getDatabase();
  const paid = getPaidShares();
  const hidden = getHiddenTripIds();
  const skipped = Object.values(db.trips).filter((trip) => trip && isTripFullyPaid(trip, db.household, paid, hidden));
  updateFoodTrackerState((state) => ({
    startedAt: new Date().toISOString(),
    logged: { ...Object.fromEntries(skipped.map((trip) => [trip.id, { skipped: true as const }])), ...state.logged },
  }));
  if (!findTrackedParticipant(db.household, config.participant)) {
    console.warn(`Food tracker: no roommate matches FOOD_TRACKER_PARTICIPANT="${config.participant}".`);
  }
}

function changedTrips(before: PaidShares, after: PaidShares): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((tripId) => JSON.stringify(before[tripId] ?? {}) !== JSON.stringify(after[tripId] ?? {}));
}

const globalForTracker = globalThis as unknown as { foodTrackerStarted?: boolean };

export function startFoodTracker(): void {
  if (globalForTracker.foodTrackerStarted) return;
  globalForTracker.foodTrackerStarted = true;
  const config = readConfig();
  if (!config) {
    console.log('Food tracker is off: set FOOD_TRACKER_URL, FOOD_TRACKER_SECRET and FOOD_TRACKER_PARTICIPANT to turn it on.');
    return;
  }
  try { skipTripsAlreadyPaid(config); } catch (err) { console.error('Food tracker failed to start:', err); return; }

  const check = debounced((tripId) => logTrip(config, tripId));
  tripEvents.on('trip-saved', (_before: Trip | null, after: Trip) => check(after.id));
  tripEvents.on('payments-saved', (before: PaidShares, after: PaidShares) => changedTrips(before, after).forEach(check));
  // Retries anything that failed to send, and catches trips that became paid while the server was down.
  const sweep = () => {
    try { Object.keys(getDatabase().trips).forEach((tripId) => logTrip(config, tripId)); }
    catch (err) { console.error('Food tracker check failed:', err); }
  };
  setTimeout(sweep, SETTLE_MS).unref?.();
  setInterval(sweep, RETRY_MS).unref?.();
}
