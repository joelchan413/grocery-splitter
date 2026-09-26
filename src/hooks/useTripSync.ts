'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Trip } from '@/types';

interface UseTripSyncProps {
  trip: Trip | null;
  onTripUpdated: (updated: Trip) => void;
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

    const sseUrl = `/api/trips/${encodeURIComponent(trip.id)}/events`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(':')) return; // Ignore heartbeat
      try {
        const updated: Trip = JSON.parse(event.data);
        if (updated && updated.id === tripIdRef.current) {
          onTripUpdated(updated);
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
      const response = await fetch(`/api/trips/${encodeURIComponent(updated.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const serverTrip: Trip = await response.json();
      if (serverTrip && serverTrip.id === tripIdRef.current) {
        onTripUpdated(serverTrip);
      }
      onSyncError(null);
    } catch (err) {
      console.error('Failed to sync trip update with server:', err);
      onSyncError('Changes could not be saved to the shared server. Keep this page open until storage is fixed.');
    }
  }, [onTripUpdated, onSyncError]);

  return {
    broadcastTripUpdate,
  };
}
