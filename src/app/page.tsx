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
import { nextTripTimestamp, sameTripData, type TripSyncUpdate } from '@/lib/trip-sync';
import { Header } from '@/components/Header';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { ReceiptPhotos } from '@/components/ReceiptPhotos';

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

type AppView = 'scanner' | 'review' | 'claiming' | 'settlement' | 'history' | 'settle-up';

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
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
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
  const [saveError, setSaveError] = useState<string | null>(null);

  const navigate = useCallback((next: AppView) => {
    openRequest.current++;
    historyRequest.current++;
    setOpeningTrip(false);
    setHistoryRefreshing(false);
    setHistoryError(null);
    setView(next);
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
  const { broadcastTripUpdate } = useTripSync({
    trip: activeTrip,
    onTripUpdated: handleTripUpdatedFromServer,
    onSyncError: setSaveError,
  });

  // A saved roommate who has since been removed from the household falls back to the first roommate.
  const currentParticipantId = household.participants.some((p) => p.id === activeParticipantId)
    ? activeParticipantId
    : household.participants[0]?.id ?? activeParticipantId;

  // Each screen opens at its top rather than at the previous screen's scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0 });
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
      const sharedTripId = urlParams.get('trip');

      if (sharedTripId) {
        try {
          const res = await fetch(`/api/trips/${encodeURIComponent(sharedTripId)}`);
          if (res.ok) {
            const serverTrip: Trip = await res.json();
            setActiveTrip(serverTrip);
            saveActiveTrip(serverTrip, { authoritative: true });
            setTripHistory(addOrUpdateTripHistory(serverTrip));
            navigate(serverTrip.status === 'review' ? 'review' : serverTrip.status === 'settled' ? 'settlement' : 'claiming');

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

        if (savedTrip.status === 'review') {
          navigate('review');
        } else if (savedTrip.status === 'settled') {
          navigate('settlement');
        } else {
          navigate('claiming');
        }
      }

      if (!initialized && !sharedTripId) {
        setIsHouseholdModalOpen(true);
        setIsFirstTimeSetup(true);
      }

      // Returning households can use their cached state while the server refreshes.
      // First-time setup still waits for the shared household to avoid editing defaults.
      if (initialized) setIsHydrated(true);

      // Sync latest household and history from server
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
        if (histRes.ok) {
          const serverHistory: Trip[] = await histRes.json();
          if (Array.isArray(serverHistory)) {
            const currentLocal = loadTripHistory();
            const merged = mergeTripHistory(currentLocal, serverHistory);
            setTripHistory(merged);
            saveTripHistory(merged);
          }
        }
      } catch {}

      setIsHydrated(true);
    }

    init();
  }, [navigate, setPaidShares, setActiveTrip]);

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
      setSaveError(null);
    } catch (err) {
      console.error('Error saving household to server:', err);
      setSaveError('Changes could not be saved to the shared server. Keep this page open until storage is fixed.');
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
      setSaveError(null);
    } catch (err) {
      console.error('Error saving hidden trip to server:', err);
      // Roll back so this device never disagrees with the shared list, which also drives exports.
      setHiddenTripIds((prev) => withChange(prev, !hidden));
      setSaveError('Could not hide or unhide that trip on the shared server. Please try again.');
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
        setSaveError(null);
        ok = true;
      } catch (err) {
        console.error('Error saving payments to server:', err);
        setSaveError('Could not save that payment to the shared server. Please try again.');
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

  const handleNewTrip = () => {
    if (
      activeTrip &&
      activeTrip.status !== 'settled' &&
      !confirm('Start a new trip? Any unsaved changes on the current trip will be replaced.')
    ) {
      return;
    }
    setActiveTrip(null);
    saveActiveTrip(null);
    window.history.replaceState({}, '', window.location.pathname);
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
      setSaveError(null);
    } catch (err) {
      console.error('Failed to create trip on server:', err);
      setSaveError('Changes could not be saved to the shared server. Keep this page open until storage is fixed.');
    }
  };

  const handleConfirmReview = (updated?: Trip) => {
    if (updated) {
      handleUpdateTrip(updated);
    }
    navigate('claiming');
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
    window.history.replaceState({}, '', window.location.pathname);
    navigate('history');

    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(settledTrip.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setSaveError(null);
    } catch (err) {
      console.error('Error archiving trip on server:', err);
      setSaveError('Changes could not be saved to the shared server. Keep this page open until storage is fixed.');
    }
  };

  const handleOpenTrip = async (selected: Trip) => {
    refreshPaidShares();
    const request = ++openRequest.current;
    setOpeningTrip(true);
    setHistoryError(null);
    try {
      const trip = await loadTripDetails(selected);
      if (request !== openRequest.current) return;
      setActiveTrip(trip);
      saveActiveTrip(trip, { authoritative: true });
      navigate(trip.status === 'review' ? 'review' : trip.status === 'settled' ? 'settlement' : 'claiming');
    } catch {
      if (request === openRequest.current) setHistoryError('Could not open this trip. Please try again.');
    } finally {
      if (request === openRequest.current) setOpeningTrip(false);
    }
  };

  const handleOpenHistory = async (target: 'history' | 'settle-up' = 'history') => {
    navigate(target);
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

  const handleBackToActive = () => {
    if (activeTrip) {
      navigate(activeTrip.status === 'review' ? 'review' : activeTrip.status === 'settled' ? 'settlement' : 'claiming');
    } else {
      navigate('scanner');
    }
  };

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

      {saveError && (
        <div role="alert" className="app-main bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {saveError}
        </div>
      )}

      <main className="app-main">
        {openingTrip && <p role="status" className="mx-auto max-w-4xl px-4 pt-4 text-sm text-slate-500">Opening trip…</p>}
        {historyError && <p role="alert" className="mx-auto max-w-4xl px-4 pt-4 text-sm text-red-700">{historyError}</p>}
        {activeTrip && (view === 'review' || view === 'claiming' || view === 'settlement') && (
          <ReceiptPhotos key={activeTrip.id} trip={activeTrip} />
        )}

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
            trip={activeTrip}
            household={household}
            onUpdateTrip={handleUpdateTrip}
            onConfirmAndProceed={handleConfirmReview}
            onBackToScanner={() => navigate('scanner')}
          />
        )}

        {view === 'claiming' && activeTrip && (
          <ClaimingBoard
            trip={activeTrip}
            household={household}
            activeParticipantId={currentParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onUpdateTrip={handleUpdateTrip}
            onViewSettlement={() => navigate('settlement')}
            onBackToReview={() => navigate('review')}
          />
        )}

        {view === 'settlement' && activeTrip && (
          <SettlementView
            trip={activeTrip}
            household={household}
            onEditClaims={() => navigate('claiming')}
            onArchiveTrip={handleArchiveCurrentTrip}
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
            onBackToActive={handleBackToActive}
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
            onBack={handleBackToActive}
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
