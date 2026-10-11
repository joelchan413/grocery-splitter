import type { Trip } from '@/types';

function getHistoryTimestamp(trip: Trip): number {
  // Updates and settlements must not move an existing trip in the archive.
  // Older cached trips may have only a receipt date.
  for (const value of [trip.createdAt, trip.date]) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function sortTripHistory(history: readonly Trip[]): Trip[] {
  return [...history].sort((a, b) => {
    const difference = getHistoryTimestamp(b) - getHistoryTimestamp(a);
    if (difference !== 0) return difference;
    // Use a locale-independent tie-breaker, including for trips without dates.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
