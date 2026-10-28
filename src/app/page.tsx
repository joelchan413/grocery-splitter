'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
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
  isHouseholdInitialized,
  setHouseholdInitialized,
  DEFAULT_HOUSEHOLD,
} from '@/lib/storage';
import { Household, Trip } from '@/types';
import { useTripSync } from '@/hooks/useTripSync';
import { Header } from '@/components/Header';
import { HouseholdModal } from '@/components/HouseholdModal';
import { SettingsModal } from '@/components/SettingsModal';
import { ShareTripModal } from '@/components/ShareTripModal';
import { IdentifyModal } from '@/components/IdentifyModal';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { ReceiptReview } from '@/components/ReceiptReview';
import { ReceiptPhotos } from '@/components/ReceiptPhotos';
import { ClaimingBoard } from '@/components/ClaimingBoard';
import { SettlementView } from '@/components/SettlementView';
import { TripHistory } from '@/components/TripHistory';

type AppView = 'scanner' | 'review' | 'claiming' | 'settlement' | 'history';

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

export default function Home() {
  const [household, setHousehold] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<string>('p1');
  const [view, setView] = useState<AppView>('scanner');
  const [isHouseholdModalOpen, setIsHouseholdModalOpen] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isIdentifyModalOpen, setIsIdentifyModalOpen] = useState(false);
  const [tripHistory, setTripHistory] = useState<Trip[]>([]);
  const [hiddenTripIds, setHiddenTripIds] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Callback when server-side SSE sends an updated trip
  const handleTripUpdatedFromServer = useCallback((serverTrip: Trip) => {
    setActiveTrip((prev) => {
      if (!prev || prev.id !== serverTrip.id) {
        return prev;
      }
      // If local state has a newer timestamp than the incoming server packet,
      // protect local optimistic claims from being overwritten by stale server packets.
      if (prev.updatedAt && serverTrip.updatedAt) {
        const localTime = new Date(prev.updatedAt).getTime();
        const serverTime = new Date(serverTrip.updatedAt).getTime();
        if (localTime > serverTime) {
          return prev;
        }
      }
      saveActiveTrip(serverTrip);
      addOrUpdateTripHistory(serverTrip);
      return serverTrip;
    });
    setTripHistory(loadTripHistory());
  }, []);

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

  // 1. Initial Load & Hydration
  useEffect(() => {
    async function init() {
      // Load local state as fast initial fallback
      const savedHousehold = loadHousehold();
      const savedTrip = loadActiveTrip();
      const savedHistory = loadTripHistory();
      const savedActiveP = loadActiveParticipantId();
      const initialized = isHouseholdInitialized();

      setHousehold(savedHousehold);
      setActiveTrip(savedTrip);
      setTripHistory(savedHistory);
      setActiveParticipantId(savedActiveP);
      setHiddenTripIds(loadHiddenTripIds());

      // Check if joining via share URL param: ?trip=xyz
      const urlParams = new URLSearchParams(window.location.search);
      const sharedTripId = urlParams.get('trip');

      if (sharedTripId) {
        try {
          const res = await fetch(`/api/trips/${encodeURIComponent(sharedTripId)}`);
          if (res.ok) {
            const serverTrip: Trip = await res.json();
            setActiveTrip(serverTrip);
            saveActiveTrip(serverTrip);
            addOrUpdateTripHistory(serverTrip);
            setTripHistory(loadTripHistory());
            setView(serverTrip.status === 'review' ? 'review' : serverTrip.status === 'settled' ? 'settlement' : 'claiming');

            // Prompt roommate identification if first time on this device
            if (!localStorage.getItem('grocery_splitter_active_participant_v1')) {
              setIsIdentifyModalOpen(true);
            }
          }
        } catch (e) {
          console.error('Error joining shared trip:', e);
        }
      } else if (savedTrip) {
        // Ensure server has this active trip registered
        try {
          await fetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(savedTrip),
          });
        } catch {}

        if (savedTrip.status === 'review') {
          setView('review');
        } else if (savedTrip.status === 'settled') {
          setView('settlement');
        } else {
          setView('claiming');
        }
      }

      if (!initialized && !sharedTripId) {
        setIsHouseholdModalOpen(true);
        setIsFirstTimeSetup(true);
      }

      // Sync latest household and history from server
      try {
        const [hhRes, histRes, serverHidden] = await Promise.all([
          fetch('/api/household'),
          fetch('/api/trips?view=history'),
          fetchHiddenTripIds(),
        ]);
        if (serverHidden) setHiddenTripIds(serverHidden);
        if (hhRes.ok) {
          const serverHousehold: Household = await hhRes.json();
          setHousehold(serverHousehold);
          saveHousehold(serverHousehold);
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
  }, []);

  // Update household locally and on server
  const handleUpdateHousehold = async (updated: Household) => {
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
    const tripWithTimestamp: Trip = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    setActiveTrip(tripWithTimestamp);
    saveActiveTrip(tripWithTimestamp);
    addOrUpdateTripHistory(tripWithTimestamp);
    setTripHistory(loadTripHistory());
    broadcastTripUpdate(tripWithTimestamp);
  };

  const handleSelectParticipant = (id: string) => {
    setActiveParticipantId(id);
    saveActiveParticipantId(id);
  };

  const handleToggleHiddenTrip = async (tripId: string) => {
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
    }
  };

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
    setView('scanner');
  };

  const handleTripScanned = async (newTrip: Trip) => {
    setActiveTrip(newTrip);
    saveActiveTrip(newTrip);
    addOrUpdateTripHistory(newTrip);
    setTripHistory(loadTripHistory());
    setView('review');

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
    setView('claiming');
  };

  const handleArchiveCurrentTrip = async () => {
    if (!activeTrip) return;
    const settledTrip: Trip = {
      ...activeTrip,
      status: 'settled',
      updatedAt: new Date().toISOString(),
    };
    archiveTrip(settledTrip);
    setTripHistory(loadTripHistory());
    setActiveTrip(null);
    saveActiveTrip(null);
    window.history.replaceState({}, '', window.location.pathname);
    setView('history');

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

  const handleOpenTrip = (selected: Trip) => {
    setActiveTrip(selected);
    saveActiveTrip(selected);
    if (selected.status === 'review') {
      setView('review');
    } else if (selected.status === 'settled') {
      setView('settlement');
    } else {
      setView('claiming');
    }
  };

  const handleOpenHistory = async () => {
    setView('history');
    fetchHiddenTripIds().then((ids) => {
      if (ids) setHiddenTripIds(ids);
    });
    try {
      const res = await fetch('/api/trips?view=history');
      if (res.ok) {
        const serverHistory: Trip[] = await res.json();
        if (Array.isArray(serverHistory)) {
          const currentLocal = loadTripHistory();
          const merged = mergeTripHistory(currentLocal, serverHistory);
          setTripHistory(merged);
          saveTripHistory(merged);
        }
      }
    } catch (e) {
      console.error('Error fetching history:', e);
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
        onOpenHistory={handleOpenHistory}
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
        {activeTrip && (view === 'review' || view === 'claiming' || view === 'settlement') && (
          <ReceiptPhotos key={activeTrip.id} trip={activeTrip} />
        )}

        {view === 'scanner' && (
          <ReceiptScanner
            household={household}
            onTripScanned={handleTripScanned}
            history={tripHistory}
            onOpenTrip={handleOpenTrip}
            onOpenHistory={handleOpenHistory}
          />
        )}

        {view === 'review' && activeTrip && (
          <ReceiptReview
            trip={activeTrip}
            household={household}
            onUpdateTrip={handleUpdateTrip}
            onConfirmAndProceed={handleConfirmReview}
            onBackToScanner={() => setView('scanner')}
          />
        )}

        {view === 'claiming' && activeTrip && (
          <ClaimingBoard
            trip={activeTrip}
            household={household}
            activeParticipantId={currentParticipantId}
            onSelectParticipant={handleSelectParticipant}
            onUpdateTrip={handleUpdateTrip}
            onViewSettlement={() => setView('settlement')}
            onBackToReview={() => setView('review')}
          />
        )}

        {view === 'settlement' && activeTrip && (
          <SettlementView
            trip={activeTrip}
            household={household}
            onEditClaims={() => setView('claiming')}
            onArchiveTrip={handleArchiveCurrentTrip}
          />
        )}

        {view === 'history' && (
          <TripHistory
            history={tripHistory}
            household={household}
            activeParticipantId={currentParticipantId}
            hiddenTripIds={hiddenTripIds}
            onToggleHidden={handleToggleHiddenTrip}
            onSelectTrip={handleOpenTrip}
            onBackToActive={() => {
              if (activeTrip) {
                setView(
                  activeTrip.status === 'review'
                    ? 'review'
                    : activeTrip.status === 'settled'
                    ? 'settlement'
                    : 'claiming'
                );
              } else {
                setView('scanner');
              }
            }}
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

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {activeTrip && (
        <ShareTripModal
          isOpen={isShareModalOpen}
          trip={activeTrip}
          household={household}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      <IdentifyModal
        isOpen={isIdentifyModalOpen}
        household={household}
        onSelect={(pId) => {
          handleSelectParticipant(pId);
          setIsIdentifyModalOpen(false);
        }}
      />
    </div>
  );
}
