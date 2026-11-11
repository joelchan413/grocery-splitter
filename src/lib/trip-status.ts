import type { Trip } from '@/types';

/**
 * How a trip's status may change. A trip only moves forward: the payer checks the items (review),
 * the household claims them (claiming), then it is archived (settled). Archived trips stay editable,
 * but keep their status. The server applies this to every save, so a device holding an old copy
 * can't move a trip backwards.
 */
export type TripStatus = Trip['status'];

const NEXT: Record<TripStatus, readonly TripStatus[]> = {
  review: ['review', 'claiming'],
  claiming: ['claiming', 'settled'],
  settled: ['settled'],
};

export const isTripStatus = (value: unknown): value is TripStatus =>
  typeof value === 'string' && Object.hasOwn(NEXT, value);

export function canChangeStatus(from: TripStatus, to: TripStatus): boolean {
  return NEXT[from].includes(to);
}

/**
 * The status a save leaves the trip in. A move that isn't allowed keeps the current status, and the
 * rest of the save still lands, so a stale device's claims aren't lost along with its old status.
 * A new trip, or one without a known status, takes the status it was sent with.
 */
export function nextTripStatus(current: unknown, requested: TripStatus): TripStatus {
  if (!isTripStatus(current)) return requested;
  return isTripStatus(requested) && canChangeStatus(current, requested) ? requested : current;
}
