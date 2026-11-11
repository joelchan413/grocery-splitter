'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Trip } from '@/types';
import { sameReceiptImages, withoutReceiptImages, type TripSyncUpdate } from '@/lib/trip-sync';

interface UseTripSyncProps {
  trip: Trip | null;
  onTripUpdated: (updated: TripSyncUpdate) => void;
  onSyncError: (message: string | null) => void;
}

const SYNC_ERROR = 'Changes could not be saved to the shared server. Keep this page open until storage is fixed.';
/** While an edit is unsaved, try again this often, as well as when the page is reopened or the phone reconnects. */
const RETRY_MS = 30 * 1000;

const revision = (trip: Pick<Trip, 'updatedAt'>) => Date.parse(trip.updatedAt || '') || 0;

// Archives the server hasn't accepted, kept across reloads: a failed archive is often followed by closing the app,
// and until it lands the server still treats the trip as open for claiming and keeps sending claim reminders.
const ARCHIVE_KEY = 'grocery_splitter_pending_archives_v1';

function loadPendingArchives(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function savePendingArchives(ids: Set<string>): void {
  try {
    if (ids.size) localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(ARCHIVE_KEY);
  } catch {}
}

export function useTripSync({ trip, onTripUpdated, onSyncError }: UseTripSyncProps) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const tripIdRef = useRef<string | null>(trip?.id || null);
  const tripRef = useRef(trip);
  // Edits the server hasn't accepted, newest per trip. Each save sends the whole trip, so a later
  // save that succeeds covers every earlier one that failed.
  const unsaved = useRef(new Map<string, Trip>());
  // The newest revision the server accepted per trip, so a slow failure can't mark a newer save unsaved.
  const savedRevision = useRef(new Map<string, number>());
  const pendingArchives = useRef<Set<string> | null>(null);
  const archives = () => (pendingArchives.current ??= loadPendingArchives());
  const hasUnsent = useCallback(() => unsaved.current.size > 0 || archives().size > 0, []);
  const retrying = useRef(false);
  const callbacks = useRef({ onTripUpdated, onSyncError });

  useEffect(() => {
    tripIdRef.current = trip?.id || null;
    tripRef.current = trip;
    callbacks.current = { onTripUpdated, onSyncError };
  });

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

  const sendTrip = useCallback(async (updated: Trip, preservePhotos: boolean) => {
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
    savedRevision.current.set(updated.id, Math.max(savedRevision.current.get(updated.id) ?? 0, revision(updated)));
    const pending = unsaved.current.get(updated.id);
    if (pending && revision(pending) <= revision(updated)) unsaved.current.delete(updated.id);
    if (serverTrip && serverTrip.id === tripIdRef.current) callbacks.current.onTripUpdated(serverTrip);
  }, []);

  const markUnsaved = useCallback((updated: Trip) => {
    if ((savedRevision.current.get(updated.id) ?? 0) >= revision(updated)) return;
    const pending = unsaved.current.get(updated.id);
    if (!pending || revision(pending) <= revision(updated)) unsaved.current.set(updated.id, updated);
  }, []);

  // Archives a trip on the server. Returns false when it should be tried again; a refusal (such as a trip
  // still being checked) can't succeed later, so it is dropped.
  const sendArchive = useCallback(async (tripId: string) => {
    const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    });
    if (response.status >= 400 && response.status < 500) console.error(`Archiving ${tripId} was refused: ${response.status}`);
    else if (!response.ok) throw new Error(`Server returned ${response.status}`);
    if (archives().delete(tripId)) savePendingArchives(archives());
  }, []);

  // Sends each unsaved trip again, then each archive. The open trip is sent as it stands now, so claims that arrived
  // since aren't overwritten; a trip that is no longer open is sent as this device last had it,
  // which is what its failed save would have sent. Photos go with it, in case the edit changed them.
  const retryUnsaved = useCallback(async () => {
    if (retrying.current || !hasUnsent()) return;
    retrying.current = true;
    try {
      for (const pending of [...unsaved.current.values()]) {
        const open = tripRef.current;
        const latest = open?.id === pending.id && !open.receiptImagesOmitted && revision(open) >= revision(pending) ? open : pending;
        await sendTrip(latest, false);
      }
      for (const tripId of [...archives()]) await sendArchive(tripId);
      if (!hasUnsent()) callbacks.current.onSyncError(null);
    } catch (err) {
      console.error('Retrying unsaved trip changes failed:', err);
      callbacks.current.onSyncError(SYNC_ERROR);
    } finally {
      retrying.current = false;
    }
  }, [sendTrip, sendArchive, hasUnsent]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') retryUnsaved();
    };
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', retryUnsaved);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(retryUnsaved, RETRY_MS);
    // An archive left over from an earlier visit goes out as soon as the app opens.
    retryUnsaved();
    return () => {
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', retryUnsaved);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [retryUnsaved]);

  // Function to broadcast updates to the server
  const broadcastTripUpdate = useCallback(async (updated: Trip) => {
    onTripUpdated(updated); // Instant optimistic update
    try {
      // Only preserve photos when this edit was made from a complete trip with
      // unchanged photos. Photo replacements and explicit removals use a full save.
      const preservePhotos = trip?.id === updated.id && !trip.receiptImagesOmitted
        && sameReceiptImages(trip.receiptImages, updated.receiptImages);
      await sendTrip(updated, preservePhotos);
      // The error stays until every unsaved trip, including ones no longer open, has been saved.
      if (!hasUnsent()) onSyncError(null);
      else retryUnsaved();
    } catch (err) {
      console.error('Failed to sync trip update with server:', err);
      markUnsaved(updated);
      if (hasUnsent()) onSyncError(SYNC_ERROR);
    }
  }, [trip, onTripUpdated, onSyncError, sendTrip, markUnsaved, retryUnsaved, hasUnsent]);

  // A trip whose first upload failed is retried like an unsaved edit: the server creates a trip it doesn't have.
  const saveLater = useCallback((unsent: Trip) => {
    markUnsaved(unsent);
    if (hasUnsent()) onSyncError(SYNC_ERROR);
  }, [markUnsaved, onSyncError, hasUnsent]);

  // Archives a trip, and keeps trying until the server accepts it.
  const archiveTrip = useCallback(async (tripId: string) => {
    archives().add(tripId);
    savePendingArchives(archives());
    try {
      await sendArchive(tripId);
      if (!hasUnsent()) onSyncError(null);
    } catch (err) {
      console.error('Error archiving trip on server:', err);
      onSyncError(SYNC_ERROR);
    }
  }, [sendArchive, onSyncError, hasUnsent]);

  return {
    broadcastTripUpdate,
    saveLater,
    archiveTrip,
  };
}
