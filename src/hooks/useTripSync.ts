'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Trip } from '@/types';
import { sameReceiptImages, withoutReceiptImages, type TripSyncUpdate } from '@/lib/trip-sync';

interface UseTripSyncProps {
  trip: Trip | null;
  onTripUpdated: (updated: TripSyncUpdate) => void;
  onSyncError: (message: string | null) => void;
}

export function useTripSync({ trip, onTripUpdated, onSyncError }: UseTripSyncProps) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const tripIdRef = useRef<string | null>(trip?.id || null);

  useEffect(() => {
    tripIdRef.current = trip?.id || null;
  }, [trip?.id]);

  useEffect(() => {
    if (!trip?.id) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const sseUrl = `/api/trips/${encodeURIComponent(trip.id)}/events?compact=1`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;
    let latestImages: string[] | undefined;

    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(':')) return; // Ignore heartbeat
      try {
        const updated: TripSyncUpdate = JSON.parse(event.data);
        if (updated && updated.id === tripIdRef.current) {
          // Keep the stream's photo snapshot even if the page rejects an older
          // claim timestamp. Its next compact event still has the right photos.
          if (updated.receiptImages !== undefined) latestImages = updated.receiptImages;
          onTripUpdated({ ...updated, receiptImages: latestImages });
        }
      } catch (err) {
        console.error('Error parsing SSE payload:', err);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [trip?.id, onTripUpdated]);

  // Function to broadcast updates to the server
  const broadcastTripUpdate = useCallback(async (updated: Trip) => {
    onTripUpdated(updated); // Instant optimistic update
    try {
      // Only preserve photos when this edit was made from a complete trip with
      // unchanged photos. Photo replacements and explicit removals use a full save.
      const preservePhotos = trip?.id === updated.id && !trip.receiptImagesOmitted
        && sameReceiptImages(trip.receiptImages, updated.receiptImages);
      const url = `/api/trips/${encodeURIComponent(updated.id)}`;
      const send = (preserve: boolean) => fetch(`${url}${preserve ? '?preservePhotos=1' : ''}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preserve ? withoutReceiptImages(updated) : updated),
      });
      let response = await send(preservePhotos);
      // Recover a locally saved trip after a server reset without creating a
      // photo-less trip or silently dropping the device's original photos.
      if (preservePhotos && response.status === 409) response = await send(false);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const serverTrip: TripSyncUpdate = await response.json();
      if (serverTrip && serverTrip.id === tripIdRef.current) {
        onTripUpdated(serverTrip);
      }
      onSyncError(null);
    } catch (err) {
      console.error('Failed to sync trip update with server:', err);
      onSyncError('Changes could not be saved to the shared server. Keep this page open until storage is fixed.');
    }
  }, [trip, onTripUpdated, onSyncError]);

  return {
    broadcastTripUpdate,
  };
}
