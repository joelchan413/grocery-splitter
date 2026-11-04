import type { Household, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';

export const EXPORT_COLUMNS = [
  'date',
  'store',
  'receipt_total',
  'food_subtotal',
  'non_food_subtotal',
  'tax',
  'paid_by',
  'my_share',
  'split_method',
  'venmo_status',
  'notes',
  'receipt_id',
] as const;

export type ExportResult =
  | { ok: true; csv: string; rowCount: number; skippedUndated: number; trips: Trip[] }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The current calendar year, in the user's local time. */
export function defaultExportRange(now: Date = new Date()): { start: string; end: string } {
  const year = String(now.getFullYear()).padStart(4, '0');
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Plain decimal with two places; empty when the value is not a usable number. */
function formatMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  // `+ 0` turns -0 into 0 so a rounded-away negative never prints as "-0.00".
  return (Math.round((value + Number.EPSILON) * 100) / 100 + 0).toFixed(2);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Trips eligible for export: not hidden, and not unchecked by the user.
 * Hidden always wins, so a hidden trip can never be exported.
 */
export function selectTripsForExport(
  trips: readonly Trip[],
  hiddenIds: readonly string[],
  deselectedIds: readonly string[]
): Trip[] {
  const hidden = new Set(hiddenIds);
  const deselected = new Set(deselectedIds);
  return trips.filter((trip) => !hidden.has(trip.id) && !deselected.has(trip.id));
}

/**
 * Builds a CSV of the trips in [start, end] (inclusive, by receipt date) that
 * `participantId` paid for or has a share of. Pure: never modifies the trips.
 *
 * The data model has no food/non-food tag, tip/fee, notes, split-method or
 * Venmo-payment fields, so those columns are always empty rather than guessed.
 */
export function exportTripsToCsv(
  trips: readonly Trip[],
  household: Household,
  participantId: string,
  start: string,
  end: string
): ExportResult {
  if (!isIsoDate(start) || !isIsoDate(end)) {
    return { ok: false, error: 'Choose a valid start and end date.' };
  }
  if (start > end) {
    return { ok: false, error: 'The start date must be on or before the end date.' };
  }
  if (!household.participants.some((p) => p.id === participantId)) {
    return { ok: false, error: 'Pick who you are in the household before exporting.' };
  }

  const rows: { date: string; id: string; fields: string[]; trip: Trip }[] = [];
  let skippedUndated = 0;

  for (const trip of trips) {
    if (!trip || typeof trip.id !== 'string') continue;
    if (!isIsoDate(trip.date)) {
      skippedUndated += 1;
      continue;
    }
    if (trip.date < start || trip.date > end) continue;

    const summary = calculateTripSettlement(trip, household);
    const me = summary.participants.find((p) => p.participantId === participantId);
    if (!me || (!me.isPayer && me.ownShare <= 0)) continue;

    rows.push({
      date: trip.date,
      id: trip.id,
      trip,
      fields: [
        trip.date,
        trip.storeName ?? '',
        formatMoney(summary.totalBill),
        '', // food_subtotal: no food/non-food tag in the schema
        '', // non_food_subtotal: no food/non-food tag, tip or fee in the schema
        formatMoney(trip.taxTotal),
        summary.payer.name,
        formatMoney(me.ownShare),
        '', // split_method: not stored
        '', // venmo_status: Venmo payments are not recorded
        '', // notes: not stored
        trip.id,
      ],
    });
  }

  rows.sort((a, b) => compareStrings(a.date, b.date) || compareStrings(a.id, b.id));

  const lines = [EXPORT_COLUMNS.join(','), ...rows.map((r) => r.fields.map(escapeCsvField).join(','))];
  return {
    ok: true,
    csv: `${lines.join('\r\n')}\r\n`,
    rowCount: rows.length,
    skippedUndated,
    trips: rows.map((r) => r.trip),
  };
}
