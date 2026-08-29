'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trip } from '@/types';

interface UseTripSyncProps {
  trip: Trip | null;
  onTripUpdated: (updated: Trip) => void;
}

export function useTripSync({ trip, onTripUpdated }: UseTripSyncProps) {
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'offline'>('offline');
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
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('connecting');

    const sseUrl = `/api/trips/${encodeURIComponent(trip.id)}/events`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setSyncStatus('connected');
    };

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

    es.onerror = () => {
      setSyncStatus('offline');
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
      await fetch(`/api/trips/${encodeURIComponent(updated.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Failed to sync trip update with server:', err);
    }
  }, [onTripUpdated]);

  return {
    syncStatus,
    broadcastTripUpdate,
  };
}
