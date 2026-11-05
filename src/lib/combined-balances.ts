import type { Household, Participant, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { paidCents, type PaidShares, type SharePayment } from '@/lib/payments';

/** One trip's contribution to a combined payment, in the payment's direction (negative when it offsets). */
export interface CombinedTripShare {
  tripId: string;
  storeName: string;
  date: string;
  amount: number;
}

/**
 * A single Venmo payment that settles everything `from` owes `to` across the unpaid trips.
 * An amount of 0 means the two roommates' debts cancel out and nothing needs to be sent.
 */
export interface CombinedPayment {
  from: Participant;
  to: Participant;
  amount: number;
  trips: CombinedTripShare[];
  /** The trip shares this payment clears, in both directions, at their full current amounts. */
  settles: SharePayment[];
  venmoDeepLink: string;
  venmoWebLink: string;
}

export interface TripDebt {
  participant: Participant;
  /** What this roommate owes the payer on the trip as it stands now. */
  owedCents: number;
  paidCents: number;
  /** What is still owed; positive when the share grew after it was paid. */
  remainingCents: number;
}

/**
 * Where a trip's repayments stand. A trip on which nobody owes anything is already paid out.
 * When whoever paid has left the household there is nobody to repay, so `payerMissing` is set and
 * the trip is never paid out or combined (the settlement would otherwise name another roommate as payer).
 */
export function tripPaymentStatus(trip: Trip, household: Household, paid: PaidShares) {
  const payerMissing = !household.participants.some((p) => p.id === trip.payerId);
  const debts: TripDebt[] = payerMissing
    ? []
    : calculateTripSettlement(trip, household)
        .participants.filter((s) => !s.isPayer && s.netOwed > 0)
        .map((s) => {
          const owedCents = Math.round(s.netOwed * 100);
          const already = paidCents(paid, trip.id, s.participantId);
          return { participant: s.participant, owedCents, paidCents: already, remainingCents: Math.max(0, owedCents - already) };
        });
  const unpaid = debts.filter((d) => d.remainingCents > 0);
  return {
    payerMissing,
    debts,
    unpaid,
    paidCount: debts.length - unpaid.length,
    isPaidOut: !payerMissing && unpaid.length === 0,
  };
}

/** Trips with confirmed items that someone still owes on. Hidden trips stay out, as they do from exports. */
export function selectUnpaidTrips(
  trips: readonly Trip[],
  household: Household,
  paid: PaidShares,
  hiddenIds: readonly string[]
): Trip[] {
  const hidden = new Set(hiddenIds);
  return trips.filter((trip) => {
    if (!trip || trip.status === 'review' || hidden.has(trip.id)) return false;
    const status = tripPaymentStatus(trip, household, paid);
    return !status.payerMissing && !status.isPaidOut;
  });
}

/** Unpaid-looking trips that can't be combined because whoever paid has left the household. */
export function selectTripsWithMissingPayer(trips: readonly Trip[], household: Household, hiddenIds: readonly string[]): Trip[] {
  const hidden = new Set(hiddenIds);
  return trips.filter(
    (trip) => trip && trip.status !== 'review' && !hidden.has(trip.id) && !household.participants.some((p) => p.id === trip.payerId)
  );
}

const VENMO_NOTE_LIMIT = 200;

function paymentNote(trips: readonly CombinedTripShare[]): string {
  const full = `Groceries: ${trips.map((t) => `${t.storeName || 'Store'} (${t.date || 'no date'})`).join(', ')}`;
  if (full.length <= VENMO_NOTE_LIMIT) return full;
  return `Groceries for ${trips.length} trips`;
}

/**
 * Combines every unpaid share into at most one payment per pair of roommates.
 * Shares already marked paid are left out. When two roommates owe each other, the smaller debt
 * is netted out of the larger one. Amounts are summed in whole cents so the combined figure
 * matches the per-trip figures exactly.
 */
export function combineUnpaidBalances(trips: readonly Trip[], household: Household, paid: PaidShares = {}): CombinedPayment[] {
  const byId = new Map(household.participants.map((p) => [p.id, p]));
  // Keyed by "a|b" with a < b; positive cents mean a owes b.
  type PairTrip = Omit<CombinedTripShare, 'amount'> & { cents: number };
  type Pair = { cents: number; trips: Map<string, PairTrip>; settles: SharePayment[] };
  const pairs = new Map<string, Pair>();

  for (const trip of trips) {
    const payerId = trip.payerId;
    const status = tripPaymentStatus(trip, household, paid);
    if (status.payerMissing) continue;

    for (const debt of status.unpaid) {
      const debtorId = debt.participant.id;
      const cents = debt.remainingCents;
      const [a, b] = debtorId < payerId ? [debtorId, payerId] : [payerId, debtorId];
      const signed = debtorId === a ? cents : -cents;
      const key = `${a}|${b}`;
      const pair: Pair = pairs.get(key) ?? { cents: 0, trips: new Map(), settles: [] };
      pair.cents += signed;
      const existing = pair.trips.get(trip.id);
      pair.trips.set(trip.id, {
        tripId: trip.id,
        storeName: trip.storeName,
        date: trip.date,
        cents: (existing?.cents ?? 0) + signed,
      });
      pair.settles.push({ tripId: trip.id, participantId: debtorId, cents: debt.owedCents });
      pairs.set(key, pair);
    }
  }

  const payments: CombinedPayment[] = [];
  for (const [key, pair] of pairs) {
    const [a, b] = key.split('|');
    const [fromId, toId, direction] = pair.cents >= 0 ? [a, b, 1] : [b, a, -1];
    const from = byId.get(fromId)!;
    const to = byId.get(toId)!;
    const amount = Math.abs(pair.cents) / 100;
    const shares = [...pair.trips.values()]
      .map(({ cents, ...share }) => ({ ...share, amount: (cents * direction) / 100 }))
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

    const handle = (to.venmoHandle || '').replace(/^@/, '').trim();
    const query =
      handle && amount > 0
        ? `recipients=${encodeURIComponent(handle)}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(paymentNote(shares))}`
        : '';
    payments.push({
      from,
      to,
      amount,
      trips: shares,
      settles: pair.settles,
      venmoDeepLink: query ? `venmo://paycharge?txn=pay&${query}` : '',
      venmoWebLink: query ? `https://account.venmo.com/pay?${query}` : '',
    });
  }

  const byText = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return payments.sort(
    (x, y) => y.amount - x.amount || byText(x.from.name, y.from.name) || byText(x.from.id, y.from.id) || byText(x.to.id, y.to.id)
  );
}
