/**
 * What each roommate has paid back on each trip: tripId -> participantId -> cents paid.
 * Recording the amount, not just a flag, means a share that grows after payment shows the difference as owed.
 * Kept apart from the trips so recording a payment never rewrites shared trip data.
 */
export type PaidShares = Record<string, Record<string, number>>;

export interface ShareRef {
  tripId: string;
  participantId: string;
}

/** A share being marked paid, with the amount it covered. */
export interface SharePayment extends ShareRef {
  cents: number;
}

export const MAX_SHARES_PER_REQUEST = 500;
const MAX_CENTS = 100_000_000;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !UNSAFE_KEYS.has(value);
}

function isValidCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_CENTS;
}

export function paidCents(paid: PaidShares, tripId: string, participantId: string): number {
  return Object.hasOwn(paid, tripId) && Object.hasOwn(paid[tripId], participantId) ? paid[tripId][participantId] : 0;
}

/** Cents still owed on a share, after what has been paid. Never negative. */
export function remainingCents(paid: PaidShares, tripId: string, participantId: string, owedCents: number): number {
  return Math.max(0, owedCents - paidCents(paid, tripId, participantId));
}

/** Returns a new record with the payments recorded. Recording again replaces the amount; idempotent. */
export function recordSharesPaid(current: PaidShares, payments: readonly SharePayment[]): PaidShares {
  const next: PaidShares = { ...current };
  for (const { tripId, participantId, cents } of payments) {
    next[tripId] = { ...(next[tripId] ?? {}), [participantId]: cents };
  }
  return next;
}

/** Returns a new record without the given shares. Trips with nothing paid are dropped. */
export function clearSharesPaid(current: PaidShares, shares: readonly ShareRef[]): PaidShares {
  const next: PaidShares = { ...current };
  for (const { tripId, participantId } of shares) {
    if (!next[tripId] || !Object.hasOwn(next[tripId], participantId)) continue;
    const rest = { ...next[tripId] };
    delete rest[participantId];
    if (Object.keys(rest).length) next[tripId] = rest;
    else delete next[tripId];
  }
  return next;
}

/** Accepts only well-formed records, so stored or received data can never break balances. */
export function sanitizePaidShares(value: unknown): PaidShares {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: PaidShares = {};
  for (const [tripId, shares] of Object.entries(value)) {
    if (!isSafeId(tripId) || !shares || typeof shares !== 'object' || Array.isArray(shares)) continue;
    const valid: Record<string, number> = {};
    for (const [participantId, cents] of Object.entries(shares)) {
      if (isSafeId(participantId) && isValidCents(cents)) valid[participantId] = cents;
    }
    if (Object.keys(valid).length) result[tripId] = valid;
  }
  return result;
}

function isShareRef(value: unknown): value is ShareRef {
  const share = value as ShareRef | null;
  return Boolean(share) && isSafeId(share!.tripId) && isSafeId(share!.participantId);
}

export function isShareRefList(value: unknown): value is ShareRef[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_SHARES_PER_REQUEST && value.every(isShareRef);
}

export function isSharePaymentList(value: unknown): value is SharePayment[] {
  return isShareRefList(value) && value.every((share) => isValidCents((share as SharePayment).cents));
}
