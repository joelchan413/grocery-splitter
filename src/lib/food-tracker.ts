import type { Household, Participant, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { isEveryoneReady } from '@/lib/notification-rules';
import { tripPaymentStatus } from '@/lib/combined-balances';
import type { PaidShares } from '@/lib/payments';

/**
 * Logs one roommate's food spending to their own spreadsheet (a 529 food log), once a trip is fully paid.
 * Pure: the server decides when to call these and sends the result to a Google Apps Script web app.
 *
 * Food means items without sales tax. In Iowa, as on most US grocery receipts, groceries are untaxed and
 * everything else is taxed, so the receipt's own tax flags already tell food from non-food.
 */

/** One spreadsheet row, matching the tracker's columns, plus what the Apps Script needs to file the photos. */
export interface FoodTrackerRow {
  tripId: string;
  date: string;
  store: string;
  /** File names the photos are saved under in the receipts folder, in order. */
  fileNames: string[];
  /** This roommate's whole share of the bill, tax included. */
  shareTotal: number;
  /** Their share of untaxed (food) items, after discounts, before tax. */
  food: number;
  /** Their share of taxed (non-food) items, after discounts, before tax. */
  nonFood: number;
  notes: string;
}

/** tripId -> what was last sent for it. `skipped` marks trips already paid when logging was turned on. */
export interface FoodTrackerState {
  /** When logging was first turned on. Trips already paid by then are skipped, so nothing logged by hand is duplicated. */
  startedAt?: string;
  logged: Record<string, { row: string; loggedAt: string } | { skipped: true }>;
}

export function emptyFoodTrackerState(): FoodTrackerState {
  return { logged: {} };
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function sanitizeFoodTrackerState(value: unknown): FoodTrackerState {
  const logged: FoodTrackerState['logged'] = {};
  const raw = isRecord(value) && isRecord(value.logged) ? value.logged : {};
  for (const [tripId, entry] of Object.entries(raw)) {
    if (UNSAFE_KEYS.has(tripId) || !isRecord(entry)) continue;
    if (entry.skipped === true) logged[tripId] = { skipped: true };
    else if (typeof entry.row === 'string' && typeof entry.loggedAt === 'string') logged[tripId] = { row: entry.row, loggedAt: entry.loggedAt };
  }
  const startedAt = isRecord(value) && typeof value.startedAt === 'string' ? value.startedAt : undefined;
  return startedAt ? { startedAt, logged } : { logged };
}

/** Finds the roommate by id, or by name ignoring case, so the setting can be either. */
export function findTrackedParticipant(household: Household, idOrName: string | undefined): Participant | undefined {
  const wanted = idOrName?.trim();
  if (!wanted) return undefined;
  return household.participants.find((p) => p.id === wanted)
    ?? household.participants.find((p) => p.name.trim().toLowerCase() === wanted.toLowerCase());
}

/**
 * Every repayment on the trip is made, so the shares are final. A trip nobody owes on (bought alone)
 * also needs everyone done claiming, or it would count as paid the moment it was submitted.
 */
export function isTripFullyPaid(trip: Trip, household: Household, paid: PaidShares, hiddenIds: readonly string[]): boolean {
  if (hiddenIds.includes(trip.id)) return false;
  const { state } = tripPaymentStatus(trip, household, paid);
  return state === 'paid-out' || (state === 'nothing-owed' && isEveryoneReady(trip, household));
}

/** One roommate's share of a trip in cents: total, food and non-food. Food and non-food are before tax. */
export function foodShareCents(trip: Trip, household: Household, participantId: string) {
  const summary = calculateTripSettlement(trip, household);
  const mine = summary.participants.find((s) => s.participantId === participantId);
  if (!mine) return { totalCents: 0, foodCents: 0, nonFoodCents: 0 };
  // Items here are already net of line discounts; the basket discount comes off food and non-food in proportion.
  const items = mine.itemsShare;
  const nonFoodItems = Math.min(items, mine.taxableSubtotal);
  const discountRate = items > 0 ? mine.basketDiscountShare / items : 0;
  const nonFoodCents = Math.max(0, Math.round(nonFoodItems * (1 - discountRate) * 100));
  const foodCents = Math.max(0, Math.round((items - nonFoodItems) * (1 - discountRate) * 100));
  return { totalCents: Math.round(mine.ownShare * 100), foodCents, nonFoodCents };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The trip's date as YYYY-MM-DD when it can be read, otherwise as written. */
export function isoDate(date: string): string {
  const trimmed = date?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!trimmed || Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

const EXTENSIONS: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' };

/** "Receipt - Hy-Vee - Oct 28, 2026.jpg", numbered when a receipt has several photos. Matches the existing folder. */
export function receiptFileNames(trip: Trip, images: readonly string[]): string[] {
  const store = (trip.storeName?.trim() || 'Groceries').replace(/[\\/:*?"<>|]/g, '-');
  const iso = isoDate(trip.date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const when = match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}` : iso || 'no date';
  return images.map((image, i) => {
    const type = /^data:image\/([a-z]+);/i.exec(image)?.[1]?.toLowerCase() ?? 'jpeg';
    const suffix = images.length > 1 ? ` (${i + 1} of ${images.length})` : '';
    return `Receipt - ${store} - ${when}${suffix}.${EXTENSIONS[type] ?? 'jpg'}`;
  });
}

const dollars = (cents: number) => Math.round(cents) / 100;

/** The row to log for this roommate, or null when they have no share in the trip. */
export function foodTrackerRow(trip: Trip, household: Household, participant: Participant): FoodTrackerRow | null {
  const { totalCents, foodCents, nonFoodCents } = foodShareCents(trip, household, participant.id);
  if (totalCents <= 0 && foodCents <= 0 && nonFoodCents <= 0) return null;
  const summary = calculateTripSettlement(trip, household);
  const payer = household.participants.find((p) => p.id === trip.payerId);
  const paidBy = payer && payer.id !== participant.id ? `, paid by ${payer.name}` : '';
  return {
    tripId: trip.id,
    date: isoDate(trip.date),
    store: trip.storeName?.trim() || 'Groceries',
    fileNames: receiptFileNames(trip, trip.receiptImages ?? []),
    shareTotal: dollars(totalCents),
    food: dollars(foodCents),
    nonFood: dollars(nonFoodCents),
    notes: `${participant.name}'s share of a $${summary.totalBill.toFixed(2)} receipt${paidBy}. Food = untaxed items. Logged by GrocerySplit.`,
  };
}

/** Compared with what was last sent, so a trip whose shares change after logging is sent again. */
export function rowKey(row: FoodTrackerRow): string {
  return JSON.stringify(row);
}
