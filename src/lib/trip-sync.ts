import type { Trip } from '@/types';

// Unlike history summaries, live updates omit the photo field entirely. Receivers
// retain their current photos; an explicit [] still means the photos were removed.
export type TripSyncUpdate = Omit<Trip, 'receiptImages'> & { receiptImages?: string[] };

export function withoutReceiptImages(trip: Trip): TripSyncUpdate {
  const { receiptImages, ...update } = trip;
  void receiptImages;
  return update;
}

export function sameReceiptImages(a: readonly string[] = [], b: readonly string[] = []): boolean {
  return a === b || (a.length === b.length && a.every((image, index) => image === b[index]));
}

/** Compare metadata without serializing multi-megabyte receipt photos. */
export function sameTripData(a: Trip, b: Trip): boolean {
  return sameReceiptImages(a.receiptImages, b.receiptImages)
    && JSON.stringify(withoutReceiptImages(a)) === JSON.stringify(withoutReceiptImages(b));
}

/** A local edit must advance the observed revision despite device clock skew. */
export function nextTripTimestamp(trip: Pick<Trip, 'updatedAt' | 'createdAt' | 'date'>, now = Date.now()): string {
  const previousTime = Date.parse(trip.updatedAt || trip.createdAt || trip.date || '');
  return new Date(Math.max(now, Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}
