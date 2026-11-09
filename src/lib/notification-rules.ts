import type { Household, Participant, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { combineUnpaidBalances, createTripStatusLookup, selectUnpaidTrips, tripPaymentStatus } from '@/lib/combined-balances';
import { paidCents, type PaidShares } from '@/lib/payments';

/**
 * Decides which push notifications to send. Pure: the server passes in what changed and what has
 * already been sent, and stores the returned markers before sending, so nothing goes out twice.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification opens the app. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
}

export interface Outgoing {
  participantId: string;
  message: PushMessage;
}

/** What has already been sent. Times are ISO strings. */
export interface NotificationState {
  /** tripId -> when the household was told the trip was submitted. */
  submitted: Record<string, string>;
  /** tripId -> when everyone was told claiming was done. */
  allReady: Record<string, string>;
  /** tripId -> participantId -> cents still owed when that roommate was last told their share went up. */
  shareIncrease: Record<string, Record<string, number>>;
  /** participantId -> when they were last sent a reminder. */
  lastReminder: Record<string, string>;
}

export const HOUR_MS = 60 * 60 * 1000;
/** A reminder goes out this long after a trip is submitted or everyone is done claiming. */
export const REMINDER_DELAY_MS = 24 * HOUR_MS;
/** At most one reminder a day. Slightly under 24 hours, so an hourly check doesn't push it a day later. */
export const REMINDER_INTERVAL_MS = 23 * HOUR_MS;
/** Claiming reminders stop after this long, so an abandoned trip doesn't nag forever. Payment reminders don't stop. */
export const CLAIM_REMINDER_WINDOW_MS = 7 * 24 * HOUR_MS;
/** Reminders are only sent between these hours, in the household's time zone. */
export const REMINDER_HOURS = { start: 9, end: 21 } as const;

export function emptyNotificationState(): NotificationState {
  return { submitted: {}, allReady: {}, shareIncrease: {}, lastReminder: {} };
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function cleanRecord<T>(value: unknown, keep: (entry: unknown) => entry is T): Record<string, T> {
  const result: Record<string, T> = {};
  if (!isRecord(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    if (!UNSAFE_KEYS.has(key) && keep(entry)) result[key] = entry;
  }
  return result;
}

const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isCents = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isCentsRecord = (value: unknown): value is Record<string, number> => isRecord(value);

/** Accepts only well-formed state, so a damaged record can never break saving a trip. */
export function sanitizeNotificationState(value: unknown): NotificationState {
  const raw = isRecord(value) ? value : {};
  const shareIncrease = cleanRecord(raw.shareIncrease, isCentsRecord);
  return {
    submitted: cleanRecord(raw.submitted, isTime),
    allReady: cleanRecord(raw.allReady, isTime),
    shareIncrease: Object.fromEntries(
      Object.entries(shareIncrease).map(([tripId, shares]) => [tripId, cleanRecord(shares, isCents)])
    ),
    lastReminder: cleanRecord(raw.lastReminder, isTime),
  };
}

// ----------------- Wording -----------------

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function storeName(trip: Trip): string {
  return trip.storeName?.trim() || 'the grocery run';
}

/** "a", "a and b", "a, b and c". */
function listPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

/** "Costco", "Costco and Aldi", "Costco, Aldi and Trader Joe's", or "4 trips". */
function listStores(trips: readonly Trip[]): string {
  if (trips.length > 3) return `${trips.length} trips`;
  return trips.length ? listPhrases(trips.map(storeName)) : 'groceries';
}

const tripUrl = (view: 'claiming' | 'settlement', trip: Trip) =>
  `/?view=${view}&trip=${encodeURIComponent(trip.id)}`;
const SETTLE_UP_URL = '/?view=settle-up';

function findPerson(household: Household, id: string): Participant | undefined {
  return household.participants.find((p) => p.id === id);
}

// ----------------- 1. Trip submitted -----------------

/** The payer confirmed the receipt, so the household can start claiming. */
export function isNewlySubmitted(before: Trip | null, after: Trip, state: NotificationState): boolean {
  return after.status === 'claiming' && (!before || before.status === 'review') && !state.submitted[after.id];
}

export function tripSubmittedMessages(trip: Trip, household: Household): Outgoing[] {
  const payer = findPerson(household, trip.payerId);
  const totalCents = Math.round(calculateTripSettlement(trip, household).totalBill * 100);
  const who = payer?.name ?? 'A roommate';
  return household.participants
    .filter((p) => p.id !== trip.payerId)
    .map((p) => ({
      participantId: p.id,
      message: {
        title: `New trip: ${storeName(trip)}`,
        body: `${who} added a ${formatDollars(totalCents)} receipt. Claim what's yours.`,
        url: tripUrl('claiming', trip),
        tag: `trip-${trip.id}`,
      },
    }));
}

// ----------------- 2. Everyone is done claiming -----------------

/** Every roommate, the payer included, has marked themselves done, as the claiming screen counts it. */
export function isEveryoneReady(trip: Trip, household: Household): boolean {
  if (trip.status === 'review' || household.participants.length === 0) return false;
  const ready = new Set(trip.readyParticipantIds ?? []);
  return household.participants.every((p) => ready.has(p.id));
}

export function everyoneReadyMessages(trip: Trip, household: Household): Outgoing[] {
  const summary = calculateTripSettlement(trip, household);
  const payer = findPerson(household, trip.payerId);
  const owedToPayerCents = summary.participants
    .filter((s) => !s.isPayer)
    .reduce((sum, s) => sum + Math.round(s.netOwed * 100), 0);

  return household.participants.map((p) => {
    const mine = summary.participants.find((s) => s.participantId === p.id);
    const owesCents = mine && !mine.isPayer ? Math.round(mine.netOwed * 100) : 0;
    let body: string;
    if (payer && p.id === payer.id) {
      body = owedToPayerCents > 0 ? `Roommates owe you ${formatDollars(owedToPayerCents)} in total.` : 'Nobody owes you anything for it.';
    } else if (payer && owesCents > 0) {
      body = `You owe ${payer.name} ${formatDollars(owesCents)}.`;
    } else {
      body = 'You don\'t owe anything for it.';
    }
    return {
      participantId: p.id,
      message: {
        title: `Everyone's done claiming ${storeName(trip)}`,
        body,
        url: tripUrl('settlement', trip),
        tag: `trip-${trip.id}`,
      },
    };
  });
}

// ----------------- 3. Payment recorded -----------------

/**
 * Tells whoever got paid. A combined payment can cover several trips and settle debts in both
 * directions, so increases are netted per pair of roommates; the one who comes out ahead is told.
 * Hidden trips are left out, as they are from Settle up.
 */
export function paymentReceivedMessages(
  before: PaidShares,
  after: PaidShares,
  trips: Record<string, Trip>,
  household: Household,
  hiddenIds: readonly string[] = []
): Outgoing[] {
  const hidden = new Set(hiddenIds);
  type Pair = { cents: number; tripsToB: Set<string>; tripsToA: Set<string> };
  const pairs = new Map<string, Pair>();

  for (const [tripId, shares] of Object.entries(after)) {
    const trip = trips[tripId];
    if (!trip || hidden.has(tripId) || !findPerson(household, trip.payerId)) continue;
    for (const [debtorId, cents] of Object.entries(shares)) {
      const delta = cents - paidCents(before, tripId, debtorId);
      if (delta <= 0 || debtorId === trip.payerId || !findPerson(household, debtorId)) continue;
      // Keyed "a|b" with a < b; positive cents mean a paid b.
      const [a, b] = debtorId < trip.payerId ? [debtorId, trip.payerId] : [trip.payerId, debtorId];
      const key = `${a}|${b}`;
      const pair = pairs.get(key) ?? { cents: 0, tripsToB: new Set(), tripsToA: new Set() };
      pair.cents += debtorId === a ? delta : -delta;
      (debtorId === a ? pair.tripsToB : pair.tripsToA).add(tripId);
      pairs.set(key, pair);
    }
  }

  const outgoing: Outgoing[] = [];
  for (const [key, pair] of pairs) {
    if (pair.cents === 0) continue;
    const [a, b] = key.split('|');
    const [fromId, toId, tripIds] = pair.cents > 0 ? [a, b, pair.tripsToB] : [b, a, pair.tripsToA];
    const from = findPerson(household, fromId)!;
    const covered = [...tripIds].map((id) => trips[id]).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    outgoing.push({
      participantId: toId,
      message: {
        title: `${from.name} paid you ${formatDollars(Math.abs(pair.cents))}`,
        body: `Marked paid for ${listStores(covered)}.`,
        url: SETTLE_UP_URL,
        tag: `paid-${fromId}`,
      },
    });
  }
  return outgoing;
}

/**
 * Trips where everyone is done but nobody was told: the 30-second wait was cut short by a restart,
 * the trip was unhidden, or it was ready before notifications existed. Each gets its marker so the
 * payment reminder can start; only trips changed in the last day are announced, so old trips stay quiet.
 */
export function readyTripsToCatchUp(
  trips: readonly Trip[],
  household: Household,
  hiddenIds: readonly string[],
  state: NotificationState,
  now: Date
): { mark: Trip[]; announce: Trip[] } {
  const hidden = new Set(hiddenIds);
  const mark = trips.filter((trip) =>
    trip && trip.status === 'claiming' && !hidden.has(trip.id) && !state.allReady[trip.id] && isEveryoneReady(trip, household));
  const announce = mark.filter((trip) => {
    const changed = timeOf(trip.updatedAt) ?? timeOf(trip.createdAt);
    return changed != null && now.getTime() - changed < REMINDER_DELAY_MS;
  });
  return { mark, announce };
}

// ----------------- 4. Share went up after paying -----------------

/**
 * Roommates who had paid but now owe more because claims changed. `notified` is what each still
 * owed when last checked, so a share is only announced again when it grows past that.
 */
export function shareIncreaseMessages(
  trip: Trip,
  household: Household,
  paid: PaidShares,
  notified: Record<string, number>
): { outgoing: Outgoing[]; next: Record<string, number> } {
  const status = tripPaymentStatus(trip, household, paid);
  const payer = findPerson(household, trip.payerId);
  const outgoing: Outgoing[] = [];
  const next: Record<string, number> = {};
  if (!payer || trip.status === 'review') return { outgoing, next };

  for (const debt of status.debts) {
    if (debt.paidCents === 0 || debt.remainingCents === 0) continue;
    const id = debt.participant.id;
    next[id] = debt.remainingCents;
    if (debt.remainingCents <= (notified[id] ?? 0)) continue;
    outgoing.push({
      participantId: id,
      message: {
        title: `Your ${storeName(trip)} share went up`,
        body: `Claims changed after you paid. You still owe ${payer.name} ${formatDollars(debt.remainingCents)}.`,
        url: tripUrl('settlement', trip),
        tag: `trip-${trip.id}`,
      },
    });
  }
  return { outgoing, next };
}

// ----------------- 5. Reminders -----------------

/** The hour of day in the household's time zone, or the server's when none is set or it is invalid. */
export function hourIn(now: Date, timeZone?: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timeZone || undefined }).format(now);
    return Number(hour);
  } catch {
    return now.getHours();
  }
}

export function isReminderHour(now: Date, timeZone?: string): boolean {
  const hour = hourIn(now, timeZone);
  return hour >= REMINDER_HOURS.start && hour < REMINDER_HOURS.end;
}

const timeOf = (value: string | undefined) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
};

/** When claiming started: when the household was told, or the trip's creation for trips older than notifications. */
function submittedAt(trip: Trip, state: NotificationState): number | null {
  return timeOf(state.submitted[trip.id]) ?? timeOf(trip.createdAt);
}

/** When the trip was ready to pay: when everyone finished claiming, or when it was archived. */
function readyToPayAt(trip: Trip, state: NotificationState): number | null {
  const ready = timeOf(state.allReady[trip.id]);
  if (ready != null) return ready;
  return trip.status === 'settled' ? timeOf(trip.updatedAt) ?? timeOf(trip.createdAt) : null;
}

export interface ReminderInput {
  trips: readonly Trip[];
  household: Household;
  paid: PaidShares;
  hiddenIds: readonly string[];
  state: NotificationState;
  now: Date;
}

/**
 * One reminder per roommate who still has something to do, at most once a day:
 * claiming a trip submitted a day ago, and paying a trip everyone finished claiming a day ago.
 * Payment amounts are the combined ones from Settle up, so several trips make one line per person.
 */
export function dueReminders({ trips, household, paid, hiddenIds, state, now }: ReminderInput): Outgoing[] {
  const nowMs = now.getTime();
  const hidden = new Set(hiddenIds);
  const visible = trips.filter((trip) => trip && !hidden.has(trip.id));

  const toClaim = new Map<string, Trip[]>();
  for (const trip of visible) {
    if (trip.status !== 'claiming' || isEveryoneReady(trip, household)) continue;
    const since = submittedAt(trip, state);
    if (since == null || nowMs - since < REMINDER_DELAY_MS || nowMs - since > CLAIM_REMINDER_WINDOW_MS) continue;
    const ready = new Set(trip.readyParticipantIds ?? []);
    for (const p of household.participants) {
      if (!ready.has(p.id)) toClaim.set(p.id, [...(toClaim.get(p.id) ?? []), trip]);
    }
  }

  const statusFor = createTripStatusLookup(household, paid);
  const unpaid = selectUnpaidTrips(visible, household, paid, [], statusFor);
  const dueTripIds = new Set(
    unpaid.filter((trip) => {
      const since = readyToPayAt(trip, state);
      return since != null && nowMs - since >= REMINDER_DELAY_MS;
    }).map((trip) => trip.id)
  );
  const toPay = new Map<string, { to: Participant; cents: number }[]>();
  for (const payment of combineUnpaidBalances(unpaid, household, paid, statusFor)) {
    const cents = Math.round(payment.amount * 100);
    if (cents <= 0 || !payment.trips.some((t) => dueTripIds.has(t.tripId))) continue;
    toPay.set(payment.from.id, [...(toPay.get(payment.from.id) ?? []), { to: payment.to, cents }]);
  }

  const outgoing: Outgoing[] = [];
  for (const p of household.participants) {
    const claims = toClaim.get(p.id) ?? [];
    const payments = toPay.get(p.id) ?? [];
    if (!claims.length && !payments.length) continue;
    const last = timeOf(state.lastReminder[p.id]);
    if (last != null && nowMs - last < REMINDER_INTERVAL_MS) continue;

    const phrases = [
      ...(claims.length ? [`claim your items from ${listStores(claims)}`] : []),
      ...payments.map(({ to, cents }) => `pay ${to.name} ${formatDollars(cents)}`),
    ];
    const sentence = listPhrases(phrases);
    outgoing.push({
      participantId: p.id,
      message: {
        title: payments.length ? 'Grocery money reminder' : 'Grocery claiming reminder',
        body: `Don't forget to ${sentence}.`,
        url: payments.length ? SETTLE_UP_URL : tripUrl('claiming', claims[0]),
        tag: 'reminder',
      },
    });
  }
  return outgoing;
}
