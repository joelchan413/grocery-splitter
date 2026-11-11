'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  getTripTimestamp,
  loadHousehold,
  saveHousehold,
  loadActiveTrip,
  saveActiveTrip,
  loadTripHistory,
  saveTripHistory,
  addOrUpdateTripHistory,
  mergeTripHistory,
  archiveTrip,
  loadActiveParticipantId,
  saveActiveParticipantId,
  loadHiddenTripIds,
  saveHiddenTripIds,
  loadPaidShares,
  savePaidShares,
  isHouseholdInitialized,
  setHouseholdInitialized,
  DEFAULT_HOUSEHOLD,
} from '@/lib/storage';
import { loadTripDetails } from '@/lib/trip-history';
import {
  clearSharesPaid,
  MAX_SHARES_PER_REQUEST,
  recordSharesPaid,
  sanitizePaidShares,
  type PaidShares,
  type ShareRef,
  type SharePayment,
} from '@/lib/payments';
import { Household, Trip } from '@/types';
import { useTripSync } from '@/hooks/useTripSync';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { nextTripTimestamp, sameTripData, type TripSyncUpdate } from '@/lib/trip-sync';
import { Header } from '@/components/Header';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { ReceiptPhotos } from '@/components/ReceiptPhotos';
import { useConfirm } from '@/components/ConfirmDialog';

// Load secondary screens and dialogs only when they are opened.
const loadingView = () => <p role="status" className="p-6 text-sm text-slate-500">Loading…</p>;
const HouseholdModal = dynamic(() => import('@/components/HouseholdModal').then((mod) => mod.HouseholdModal), { loading: loadingView });
const SettingsModal = dynamic(() => import('@/components/SettingsModal').then((mod) => mod.SettingsModal), { loading: loadingView });
const ShareTripModal = dynamic(() => import('@/components/ShareTripModal').then((mod) => mod.ShareTripModal), { loading: loadingView });
const IdentifyModal = dynamic(() => import('@/components/IdentifyModal').then((mod) => mod.IdentifyModal), { loading: loadingView });
const ReceiptReview = dynamic(() => import('@/components/ReceiptReview').then((mod) => mod.ReceiptReview), { loading: loadingView });
const ClaimingBoard = dynamic(() => import('@/components/ClaimingBoard').then((mod) => mod.ClaimingBoard), { loading: loadingView });
const SettlementView = dynamic(() => import('@/components/SettlementView').then((mod) => mod.SettlementView), { loading: loadingView });
const TripHistory = dynamic(() => import('@/components/TripHistory').then((mod) => mod.TripHistory), { loading: loadingView });
const SettleUp = dynamic(() => import('@/components/SettleUp').then((mod) => mod.SettleUp), { loading: loadingView });

type SaveChannel = 'trip' | 'archive' | 'household' | 'hidden' | 'payments';
const SAVE_ERROR = 'Changes could not be saved to the shared server. Keep this page open until storage is fixed.';

type AppView = 'scanner' | 'review' | 'claiming' | 'settlement' | 'history' | 'settle-up';
type TripView = Extract<AppView, 'review' | 'claiming' | 'settlement'>;

const APP_VIEWS: readonly AppView[] = ['scanner', 'review', 'claiming', 'settlement', 'history', 'settle-up'];
const isTripView = (view: AppView): view is TripView => view === 'review' || view === 'claiming' || view === 'settlement';
const tripViewFor = (trip: Trip): TripView =>
  trip.status === 'review' ? 'review' : trip.status === 'settled' ? 'settlement' : 'claiming';
// A run still being checked can't skip ahead; any other requested step stands.
const allowedTripView = (trip: Trip, requested: AppView | null): TripView =>
  requested && isTripView(requested) && (trip.status !== 'review' || requested === 'review') ? requested : tripViewFor(trip);

// Each screen has its own address, so Back, Forward and reload behave like the rest of the web.
function viewFromUrl(): AppView | null {
  const view = new URLSearchParams(window.location.search).get('view');
  return APP_VIEWS.includes(view as AppView) ? (view as AppView) : null;
}

function urlForView(view: AppView, tripId?: string): string {
  const params = new URLSearchParams(window.location.search);
  // A bare address resumes the open trip on launch, so a new run started beside an open trip names itself.
  if (view === 'scanner' && !tripId) params.delete('view');
  else params.set('view', view);
  // A trip's screens name the trip, so Back after opening another trip returns to the right one.
  if (isTripView(view) && tripId) params.set('trip', tripId);
  else params.delete('trip');
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

// Hiding is shared with the household, so the server list is authoritative.
async function fetchHiddenTripIds(): Promise<string[] | null> {
  try {
    const res = await fetch('/api/hidden-trips');
    if (!res.ok) return null;
    const ids: unknown = await res.json();
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

// Payments are shared with the household too, so the server record is authoritative.
async function fetchPaidShares(): Promise<PaidShares | null> {
  try {
    const res = await fetch('/api/payments');
    return res.ok ? sanitizePaidShares(await res.json()) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [household, setHousehold] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [activeTrip, setActiveTripState] = useState<Trip | null>(null);
  // Sync callbacks can run several times before React renders the next frame.
  const activeTripRef = useRef<Trip | null>(null);
  const setActiveTrip = useCallback((next: Trip | null) => {
    activeTripRef.current = next;
    setActiveTripState(next);
  }, []);
  const [activeParticipantId, setActiveParticipantId] = useState<string>('p1');
  const [view, setView] = useState<AppView>('scanner');
  const [isHouseholdModalOpen, setIsHouseholdModalOpen] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetupState] = useState(false);
  const firstTimeSetup = useRef(false);
  const setIsFirstTimeSetup = useCallback((value: boolean) => {
    firstTimeSetup.current = value;
    setIsFirstTimeSetupState(value);
  }, []);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const push = usePushNotifications();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isIdentifyModalOpen, setIsIdentifyModalOpen] = useState(false);
  const [tripHistory, setTripHistory] = useState<Trip[]>([]);
  const [hiddenTripIds, setHiddenTripIds] = useState<string[]>([]);
  const [paidShares, setPaidSharesState] = useState<PaidShares>({});
  // Mirrors the latest payments, so handlers never compute from a stale render.
  const paidSharesRef = useRef<PaidShares>({});
  const setPaidShares = useCallback((next: PaidShares | ((prev: PaidShares) => PaidShares)) => {
    const value = typeof next === 'function' ? next(paidSharesRef.current) : next;
    paidSharesRef.current = value;
    setPaidSharesState(value);
  }, []);
  // Saves go to the server one at a time, so replies can't arrive out of order. `paymentSave` counts saves started,
  // so a refresh or the startup read can tell that a save began while it was loading, and drop its result.
  const paymentSave = useRef(0);
  const householdSave = useRef(0);
  const hiddenSave = useRef(0);
  const pendingHiddenSaves = useRef(0);
  const paymentQueue = useRef<Promise<unknown>>(Promise.resolve());
  // Changes shown on screen but not yet confirmed, in the order they were made.
  const pendingPayments = useRef<{ apply: (prev: PaidShares) => PaidShares }[]>([]);
  // The last record the server itself sent, with no unconfirmed changes mixed in. A failed save falls back to it.
  const confirmedPaidShares = useRef<PaidShares>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openingTrip, setOpeningTrip] = useState(false);
  const openRequest = useRef(0);
  const historyRequest = useRef(0);
  // Each kind of save reports its own failure, so one that succeeds can't hide another that didn't.
  const [saveErrors, setSaveErrors] = useState<Partial<Record<SaveChannel, string>>>({});
  const setSaveError = useCallback((channel: SaveChannel, message: string | null) => {
    setSaveErrors((prev) => {
      if ((prev[channel] ?? null) === message) return prev;
      const next = { ...prev };
      if (message) next[channel] = message;
      else delete next[channel];
      return next;
    });
  }, []);
  const setTripSaveError = useCallback((message: string | null) => setSaveError('trip', message), [setSaveError]);

  const confirm = useConfirm();
  const currentView = useRef(view);
  useEffect(() => {
    currentView.current = view;
  }, [view]);
  // Check items keeps edits locally until it's left; this saves them on demand, before the open trip changes.
  const flushReviewEdits = useRef<(() => void) | null>(null);

  // 'push' adds a history entry, 'replace' rewrites the current one, and 'none' follows Back or Forward.
  const navigate = useCallback((next: AppView, mode: 'push' | 'replace' | 'none' = 'push') => {
    openRequest.current++;
    historyRequest.current++;
    setOpeningTrip(false);
    setHistoryRefreshing(false);
    setHistoryError(null);
    setView(next);
    // A dialog belongs to the screen it opened over. First-time household setup is the one that must stay.
    setIsShareModalOpen(false);
    setIsSettingsModalOpen(false);
    setIsHouseholdModalOpen((open) => open && firstTimeSetup.current);
    if (mode === 'none') return;
    const url = urlForView(next, activeTripRef.current?.id);
    const here = `${window.location.pathname}${window.location.search}`;
    if (mode === 'replace') window.history.replaceState(null, '', url);
    else if (url !== here) window.history.pushState(null, '', url);
  }, []);

  // Apply optimistic edits and server updates through one persistence path.
  const handleTripUpdatedFromServer = useCallback((serverTrip: TripSyncUpdate) => {
    const prev = activeTripRef.current;
    if (!prev || prev.id !== serverTrip.id) return;
    // Protect newer local claims from stale server packets.
    if (prev.updatedAt && serverTrip.updatedAt && Date.parse(prev.updatedAt) > Date.parse(serverTrip.updatedAt)) return;
    const complete: Trip = { ...serverTrip, receiptImages: serverTrip.receiptImages ?? prev.receiptImages };
    // SSE and the PATCH response can describe the exact same save.
    if (sameTripData(prev, complete)) return;
    setActiveTrip(complete);
    saveActiveTrip(complete, { authoritative: true });
    setTripHistory(addOrUpdateTripHistory(complete));
  }, [setActiveTrip]);

  // Real-time synchronization hook
  const { broadcastTripUpdate, saveLater } = useTripSync({
    trip: activeTrip,
    onTripUpdated: handleTripUpdatedFromServer,
    onSyncError: setTripSaveError,
  });

  // A saved roommate who has since been removed from the household falls back to the first roommate.
  const currentParticipantId = household.participants.some((p) => p.id === activeParticipantId)
    ? activeParticipantId
    : household.participants[0]?.id ?? activeParticipantId;

  // Each screen opens at its top, and focus moves to its heading so keyboard and screen-reader users land on it.
  const firstScreen = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading) return false;
      // Someone already moved on, for example into a field: leave their focus alone.
      if (main.contains(document.activeElement) && document.activeElement !== heading) return true;
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusHeading()) return;
    // Screens load on demand, so wait for the heading to arrive, however slow the network.
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const giveUp = window.setTimeout(() => observer.disconnect(), 10000);
    return () => {
      observer.disconnect();
      window.clearTimeout(giveUp);
    };
  }, [view]);

  // Keep a local copy so hidden trips stay out of exports if the server is unreachable.
  useEffect(() => {
    if (isHydrated) saveHiddenTripIds(hiddenTripIds);
  }, [hiddenTripIds, isHydrated]);

  useEffect(() => {
    if (isHydrated) savePaidShares(paidShares);
  }, [paidShares, isHydrated]);


  // 1. Initial Load & Hydration
  useEffect(() => {
    async function init() {
      // Load local state as fast initial fallback
      const savedHousehold = loadHousehold();
      const savedTrip = await loadActiveTrip();
      const savedHistory = loadTripHistory();
      saveTripHistory(savedHistory);
      const savedActiveP = loadActiveParticipantId();
      const initialized = isHouseholdInitialized();

      setHousehold(savedHousehold);
      setActiveTrip(savedTrip);
      if (savedTrip) saveActiveTrip(savedTrip);
      setTripHistory(savedHistory);
      setActiveParticipantId(savedActiveP);
      setHiddenTripIds(loadHiddenTripIds());
      const cachedPaid = loadPaidShares();
      confirmedPaidShares.current = cachedPaid;
      setPaidShares(cachedPaid);

      // Check if joining via share URL param: ?trip=xyz
      const urlParams = new URLSearchParams(window.location.search);
      const urlTripId = urlParams.get('trip');
      // The trip this phone already has open is a reload, not someone joining from a shared link.
      const sharedTripId = urlTripId && urlTripId !== savedTrip?.id ? urlTripId : null;
      // A reload or a bookmarked screen reopens that screen when it still applies.
      const urlView = viewFromUrl();
      const openTripView = (trip: Trip) =>
        navigate(urlView && !isTripView(urlView) ? urlView : allowedTripView(trip, urlView), 'replace');
      let openedTrip = false;

      if (sharedTripId) {
        try {
          const res = await fetch(`/api/trips/${encodeURIComponent(sharedTripId)}`);
          if (res.ok) {
            const serverTrip: Trip = await res.json();
            setActiveTrip(serverTrip);
            saveActiveTrip(serverTrip, { authoritative: true });
            setTripHistory(addOrUpdateTripHistory(serverTrip));
            openTripView(serverTrip);
            openedTrip = true;

            // Prompt roommate identification if first time on this device
            if (!localStorage.getItem('grocery_splitter_active_participant_v1')) {
              setIsIdentifyModalOpen(true);
            }
          }
        } catch (e) {
          console.error('Error joining shared trip:', e);
        }
      } else if (savedTrip) {
        // Restore missing or newer local edits, without re-uploading all receipt
        // photos and rewriting the database on every visit to an unchanged trip.
        try {
          const res = await fetch(`/api/trips/${encodeURIComponent(savedTrip.id)}`, { method: 'HEAD', cache: 'no-store' });
          const serverTime = Date.parse(res.headers.get('X-Trip-Updated-At') || '');
          if (res.status === 404 || (res.ok && (!Number.isFinite(serverTime) || getTripTimestamp(savedTrip) > serverTime))) {
            await fetch('/api/trips', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(savedTrip),
            });
          }
        } catch {}

        openTripView(savedTrip);
        openedTrip = true;
      }

      if (!openedTrip && !sharedTripId) {
        // Without a trip, its screens fall back to a new run. A shared link that failed to load keeps its address for a retry.
        navigate(urlView && !isTripView(urlView) ? urlView : 'scanner', 'replace');
      }

      if (!initialized && !sharedTripId) {
        setIsHouseholdModalOpen(true);
        setIsFirstTimeSetup(true);
      }

      // Returning households can use their cached state while the server refreshes.
      // First-time setup still waits for the shared household to avoid editing defaults.
      if (initialized) setIsHydrated(true);

      // Sync latest household and history from server. A reload of History or Settle up says it's refreshing.
      const showsHistory = urlView === 'history' || urlView === 'settle-up';
      // Leaving the screen before this finishes starts a new request, which owns the status from then on.
      const historyLoad = historyRequest.current;
      const stillShowingHistory = () => showsHistory && historyRequest.current === historyLoad;
      if (showsHistory) setHistoryRefreshing(true);
      let historyFailed = false;
      try {
        const [hhRes, histRes, serverHidden, serverPaid] = await Promise.all([
          fetch('/api/household'),
          fetch('/api/trips?view=history&summary=1'),
          fetchHiddenTripIds(),
          fetchPaidShares(),
        ]);
        if (serverHidden && hiddenSave.current === 0) setHiddenTripIds(serverHidden);
        if (serverPaid && paymentSave.current === 0) {
          confirmedPaidShares.current = serverPaid;
          setPaidShares(serverPaid);
        }
        if (hhRes.ok) {
          const serverHousehold: Household = await hhRes.json();
          if (householdSave.current === 0) {
            setHousehold(serverHousehold);
            saveHousehold(serverHousehold);
          }
        }
        const serverHistory: unknown = histRes.ok ? await histRes.json() : null;
        if (Array.isArray(serverHistory)) {
          const currentLocal = loadTripHistory();
          const merged = mergeTripHistory(currentLocal, serverHistory as Trip[]);
          setTripHistory(merged);
          saveTripHistory(merged);
        } else {
          historyFailed = true;
        }
      } catch {
        historyFailed = true;
      }
      if (stillShowingHistory()) {
        setHistoryRefreshing(false);
        // The same message as opening History by hand: the saved runs stay on screen.
        if (historyFailed) setHistoryError('Could not refresh history. Showing saved runs.');
      }

      setIsHydrated(true);
    }

    init();
  }, [navigate, setPaidShares, setActiveTrip, setIsFirstTimeSetup]);

  // Update household locally and on server
  const handleUpdateHousehold = async (updated: Household) => {
    householdSave.current++;
    setHousehold(updated);
    saveHousehold(updated);
    setHouseholdInitialized(true);
    setIsFirstTimeSetup(false);

    try {
      const response = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setSaveError('household', null);
    } catch (err) {
      console.error('Error saving household to server:', err);
      setSaveError('household', SAVE_ERROR);
    }
  };

  // Update trip locally and broadcast to connected roommates
  const handleUpdateTrip = (updated: Trip) => {
    // Local taps must advance the current revision even when this phone's clock
    // is behind the server. The stale-server guard must never discard an edit.
    const tripWithTimestamp: Trip = {
      ...updated,
      updatedAt: nextTripTimestamp(activeTripRef.current ?? updated),
    };
    broadcastTripUpdate(tripWithTimestamp);
  };

  const handleSelectParticipant = (id: string) => {
    setActiveParticipantId(id);
    saveActiveParticipantId(id);
  };

  const handleToggleHiddenTrip = async (tripId: string) => {
    hiddenSave.current++;
    pendingHiddenSaves.current++;
    const hidden = !hiddenTripIds.includes(tripId);
    const withChange = (ids: string[], hide: boolean) =>
      hide ? (ids.includes(tripId) ? ids : [...ids, tripId]) : ids.filter((id) => id !== tripId);

    setHiddenTripIds((prev) => withChange(prev, hidden));
    try {
      const response = await fetch('/api/hidden-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, hidden }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setSaveError('hidden', null);
    } catch (err) {
      console.error('Error saving hidden trip to server:', err);
      // Roll back so this device never disagrees with the shared list, which also drives exports.
      setHiddenTripIds((prev) => withChange(prev, !hidden));
      setSaveError('hidden', 'Could not hide or unhide that trip on the shared server. Please try again.');
    } finally {
      pendingHiddenSaves.current--;
    }
  };

  // Loads the household's payments unless a save started since, whose reply is newer.
  const refreshPaidShares = useCallback(async () => {
    // A save in flight will bring back the server's record itself; a read now could land after it, stale.
    if (pendingPayments.current.length > 0) return;
    const startedAfter = paymentSave.current;
    const paid = await fetchPaidShares();
    if (paid && startedAfter === paymentSave.current && pendingPayments.current.length === 0) {
      confirmedPaidShares.current = paid;
      setPaidShares(paid);
    }
  }, [setPaidShares]);

  // Another roommate may have recorded a payment on their phone; catch up when this tab comes back.
  useEffect(() => {
    if (!isHydrated) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPaidShares();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isHydrated, refreshPaidShares]);

  // Shows the server's last confirmed record with any still-unsent changes on top.
  const showConfirmedPayments = () =>
    setPaidShares(pendingPayments.current.reduce((shares, pending) => pending.apply(shares), confirmedPaidShares.current));

  // Shows a payment change at once, then saves it after any earlier saves. Returns whether the server accepted it.
  const savePayments = (body: { paid: boolean; shares: ShareRef[] }, apply: (prev: PaidShares) => PaidShares) => {
    paymentSave.current++;
    const pending = { apply };
    pendingPayments.current.push(pending);
    setPaidShares(apply);

    const send = async () => {
      let ok = false;
      try {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        confirmedPaidShares.current = sanitizePaidShares(await response.json());
        setSaveError('payments', null);
        ok = true;
      } catch (err) {
        console.error('Error saving payments to server:', err);
        setSaveError('payments', 'Could not save that payment to the shared server. Please try again.');
        // The save may or may not have landed; ask the server. Nothing else is sent until this returns.
        const paid = await fetchPaidShares();
        if (paid) confirmedPaidShares.current = paid;
      }
      pendingPayments.current = pendingPayments.current.filter((p) => p !== pending);
      showConfirmedPayments();
      return ok;
    };

    const result = paymentQueue.current.then(send);
    paymentQueue.current = result.catch(() => undefined);
    return result;
  };

  // Sends large changes in batches the server accepts, stopping at the first failure so its error stays shown.
  const saveInBatches = async <T extends ShareRef>(shares: T[], save: (batch: T[]) => Promise<boolean>) => {
    for (let i = 0; i < shares.length; i += MAX_SHARES_PER_REQUEST) {
      if (!(await save(shares.slice(i, i + MAX_SHARES_PER_REQUEST)))) return false;
    }
    return true;
  };

  // Records roommates as having paid back the given amounts (their full share at the time).
  const handleRecordPayments = (payments: SharePayment[]) =>
    saveInBatches(payments, (batch) => savePayments({ paid: true, shares: batch }, (prev) => recordSharesPaid(prev, batch)));

  const handleClearPayments = (shares: ShareRef[]) =>
    saveInBatches(shares, (batch) => savePayments({ paid: false, shares: batch }, (prev) => clearSharesPaid(prev, batch)));

  const handleNewTrip = async () => {
    if (
      activeTrip &&
      activeTrip.status !== 'settled' &&
      !(await confirm({
        title: 'Start a new trip?',
        body: activeTrip.status === 'review'
          ? `${activeTrip.storeName || 'The current trip'} stays in History. Open it there to finish checking items.`
          : `${activeTrip.storeName || 'The current trip'} stays in History, and roommates can still claim on it from there.`,
        confirmLabel: 'Start new trip',
      }))
    ) {
      return;
    }
    flushReviewEdits.current?.();
    setActiveTrip(null);
    saveActiveTrip(null);
    navigate('scanner');
  };

  const handleTripScanned = async (newTrip: Trip) => {
    setActiveTrip(newTrip);
    saveActiveTrip(newTrip, { authoritative: true });
    setTripHistory(addOrUpdateTripHistory(newTrip));
    navigate('review');

    // Save to server database immediately
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTrip),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
    } catch (err) {
      console.error('Failed to create trip on server:', err);
      saveLater(newTrip);
    }
  };

  const handleConfirmReview = (updated?: Trip, next: 'claiming' | 'settlement' = 'claiming') => {
    if (updated) {
      handleUpdateTrip(updated);
    }
    navigate(next);
  };

  const handleArchiveCurrentTrip = async () => {
    if (!activeTrip) return;
    const settledTrip: Trip = {
      ...activeTrip,
      status: 'settled',
      updatedAt: nextTripTimestamp(activeTrip),
    };
    setTripHistory(archiveTrip(settledTrip));
    setActiveTrip(null);
    saveActiveTrip(null);
    navigate('history');

    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(settledTrip.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setSaveError('archive', null);
    } catch (err) {
      console.error('Error archiving trip on server:', err);
      setSaveError('archive', SAVE_ERROR);
    }
  };

  const handleOpenTrip = async (selected: Trip, view: AppView | null = null, mode: 'push' | 'replace' = 'push') => {
    refreshPaidShares();
    const request = ++openRequest.current;
    setOpeningTrip(true);
    setHistoryError(null);
    try {
      const trip = await loadTripDetails(selected);
      if (request !== openRequest.current) return;
      if (activeTripRef.current?.id !== trip.id) flushReviewEdits.current?.();
      setActiveTrip(trip);
      saveActiveTrip(trip, { authoritative: true });
      navigate(allowedTripView(trip, view), mode);
    } catch {
      if (request !== openRequest.current) return;
      setHistoryError('Could not open this trip. Please try again.');
      // Back or Forward already moved the address; put it back to the screen still showing.
      if (mode === 'replace') window.history.replaceState(null, '', urlForView(currentView.current, activeTripRef.current?.id));
    } finally {
      if (request === openRequest.current) setOpeningTrip(false);
    }
  };

  const handleOpenHistory = async (target: 'history' | 'settle-up' = 'history', mode: 'push' | 'none' = 'push') => {
    navigate(target, mode);
    const request = ++historyRequest.current;
    setHistoryRefreshing(true);
    setHistoryError(null);
    const hiddenVersion = hiddenSave.current;
    if (pendingHiddenSaves.current === 0) fetchHiddenTripIds().then((ids) => {
      if (ids && hiddenVersion === hiddenSave.current && pendingHiddenSaves.current === 0) setHiddenTripIds(ids);
    });
    refreshPaidShares();
    try {
      const res = await fetch('/api/trips?view=history&summary=1');
      if (!res.ok) throw new Error('History request failed');
      const serverHistory: Trip[] = await res.json();
      if (!Array.isArray(serverHistory)) throw new Error('Invalid history response');
      if (request === historyRequest.current) {
        const currentLocal = loadTripHistory();
        const merged = mergeTripHistory(currentLocal, serverHistory);
        setTripHistory(merged);
        saveTripHistory(merged);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
      if (request === historyRequest.current) setHistoryError('Could not refresh history. Showing saved runs.');
    } finally {
      if (request === historyRequest.current) setHistoryRefreshing(false);
    }
  };

  // Back and Forward return to the screen they name; a trip's screens need that trip to still be open.
  const reopenTrip = useRef(handleOpenTrip);
  const openHistory = useRef(handleOpenHistory);
  const historyList = useRef(tripHistory);
  useEffect(() => {
    reopenTrip.current = handleOpenTrip;
    openHistory.current = handleOpenHistory;
    historyList.current = tripHistory;
  });
  useEffect(() => {
    const onPopState = () => {
      const target = viewFromUrl() ?? 'scanner';
      // History and Settle up refresh from the server whichever way they're reached.
      if (target === 'history' || target === 'settle-up') return void openHistory.current(target, 'none');
      // Rewritten in place, so a bare address that would resume the open trip names the new-run screen instead.
      if (target === 'scanner') return navigate('scanner', 'replace');
      if (!isTripView(target)) return navigate(target, 'none');
      const tripId = new URLSearchParams(window.location.search).get('trip');
      const current = activeTripRef.current;
      if (current && (!tripId || tripId === current.id)) return navigate(allowedTripView(current, target), 'replace');
      const saved = tripId ? historyList.current.find((trip) => trip.id === tripId) : undefined;
      // The entry names a trip that is no longer open: reopen it from history, or start over if it's gone.
      if (saved) reopenTrip.current(saved, target, 'replace');
      else navigate('scanner', 'replace');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50" role="status">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-slate-500">Loading GrocerySplit…</p>
        </div>
      </div>
    );
  }

  // Several failed saves can share a message; show it once.
  const saveErrorMessages = [...new Set(Object.values(saveErrors))];
  const photos = activeTrip ? <ReceiptPhotos key={activeTrip.id} trip={activeTrip} /> : null;
  const openTrip = activeTrip && activeTrip.status !== 'settled'
    ? { name: activeTrip.storeName || 'this trip', onOpen: () => navigate(tripViewFor(activeTrip)) }
    : undefined;

  return (
    <div className="app-shell">
      <Header
        household={household}
        activeView={view}
        hasActiveTrip={Boolean(activeTrip && (view === 'claiming' || view === 'settlement' || view === 'review'))}
        onNewTrip={handleNewTrip}
        onOpenHistory={() => handleOpenHistory('history')}
        onOpenSettleUp={() => handleOpenHistory('settle-up')}
        onOpenHousehold={() => setIsHouseholdModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
      />

      {saveErrorMessages.length > 0 && (
        <div role="alert" className="app-main bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {saveErrorMessages.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}

      <main className="app-main">
        {openingTrip && <p role="status" className="screen pb-0! text-sm text-slate-500">Opening trip…</p>}
        {historyError && <p role="alert" className="screen pb-0! text-sm text-red-700">{historyError}</p>}

        {view === 'scanner' && (
          <ReceiptScanner
            household={household}
            onTripScanned={handleTripScanned}
            history={tripHistory}
            onOpenTrip={handleOpenTrip}
            onOpenHistory={() => handleOpenHistory('history')}
          />
        )}

        {view === 'review' && activeTrip && (
          <ReceiptReview
            key={activeTrip.id}
            trip={activeTrip}
            household={household}
            onUpdateTrip={(edited) => {
              // Edits saved on the way out only apply while that trip is still the open one.
              if (activeTripRef.current?.id === edited.id) handleUpdateTrip(edited);
            }}
            onConfirmAndProceed={handleConfirmReview}
            flushRef={flushReviewEdits}
            photos={photos}
          />
        )}

        {view === 'claiming' && activeTrip && (
          <ClaimingBoard
            key={activeTrip.id}
            trip={activeTrip}
            household={household}
            activeParticipantId={currentParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onUpdateTrip={handleUpdateTrip}
            onViewSettlement={() => navigate('settlement')}
            onBackToReview={() => navigate('review')}
            photos={photos}
          />
        )}

        {view === 'settlement' && activeTrip && (
          <SettlementView
            key={activeTrip.id}
            trip={activeTrip}
            household={household}
            onEditClaims={() => navigate('claiming')}
            onEditItems={() => navigate('review')}
            onArchiveTrip={handleArchiveCurrentTrip}
            photos={photos}
            paidShares={paidShares}
            onRecordPayments={handleRecordPayments}
            onClearPayments={handleClearPayments}
          />
        )}

        {view === 'history' && (
          <TripHistory
            refreshing={historyRefreshing}
            history={tripHistory}
            household={household}
            activeParticipantId={currentParticipantId}
            hiddenTripIds={hiddenTripIds}
            onToggleHidden={handleToggleHiddenTrip}
            paidShares={paidShares}
            onRecordPayments={handleRecordPayments}
            onClearPayments={handleClearPayments}
            onOpenSettleUp={() => handleOpenHistory('settle-up')}
            onSelectTrip={handleOpenTrip}
            openTrip={openTrip}
          />
        )}

        {view === 'settle-up' && (
          <SettleUp
            refreshing={historyRefreshing}
            history={tripHistory}
            household={household}
            paidShares={paidShares}
            hiddenTripIds={hiddenTripIds}
            activeParticipantId={currentParticipantId}
            onRecordPayments={handleRecordPayments}
            onSelectTrip={handleOpenTrip}
            openTrip={openTrip}
          />
        )}
      </main>

      {/* Household & Settings Modals */}
      {isHouseholdModalOpen && <HouseholdModal
        isOpen={isHouseholdModalOpen}
        household={household}
        isFirstTime={isFirstTimeSetup}
        onClose={() => setIsHouseholdModalOpen(false)}
        onSave={handleUpdateHousehold}
      />}

      {isSettingsModalOpen && <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        push={push}
        household={household}
        defaultParticipantId={activeParticipantId}
      />}

      {isShareModalOpen && activeTrip && (
        <ShareTripModal
          isOpen={isShareModalOpen}
          trip={activeTrip}
          household={household}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {isIdentifyModalOpen && <IdentifyModal
        isOpen={isIdentifyModalOpen}
        household={household}
        onSelect={(pId) => {
          handleSelectParticipant(pId);
          setIsIdentifyModalOpen(false);
        }}
      />}
    </div>
  );
}
