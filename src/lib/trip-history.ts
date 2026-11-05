import type { Trip } from '@/types';
import { loadCachedTrip } from '@/lib/trip-cache';

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
  return history.map((trip) => ({ trip, timestamp: getHistoryTimestamp(trip) })).sort((a, b) => {
    const difference = b.timestamp - a.timestamp;
    if (difference !== 0) return difference;
    // Use a locale-independent tie-breaker, including for trips without dates.
    return a.trip.id < b.trip.id ? -1 : a.trip.id > b.trip.id ? 1 : 0;
  }).map(({ trip }) => trip);
}

/** Leaves the data needed for balances and CSV exports, without embedding receipt photos. */
export function summarizeTrip(trip: Trip): Trip {
  return { ...trip, receiptImages: [], receiptImagesOmitted: true };
}

/** Summaries are display-only; always retrieve the complete trip before editing or exporting photos. */
export async function loadTripDetails(trip: Trip): Promise<Trip> {
  if (!trip.receiptImagesOmitted) return trip;
  try {
    const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the trip. Please try again.');
    const full: Trip = await response.json();
    if (!full || full.id !== trip.id || full.receiptImagesOmitted || !Array.isArray(full.items) || (full.receiptImages != null && !Array.isArray(full.receiptImages))) {
      throw new Error('Could not load the complete trip. Please try again.');
    }
    return { ...full, receiptImages: full.receiptImages ?? [] };
  } catch (error) {
    // Offline history can still open the last complete snapshot saved on this
    // device. Never combine fresh metadata with a different version's photos.
    try { const cached = await loadCachedTrip(trip.id); if (cached) return cached; } catch {}
    throw error;
  }
}
