'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  loadHousehold,
  saveHousehold,
  loadActiveTrip,
  saveActiveTrip,
  loadTripHistory,
  archiveTrip,
  loadActiveParticipantId,
  saveActiveParticipantId,
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
import { ClaimingBoard } from '@/components/ClaimingBoard';
import { SettlementView } from '@/components/SettlementView';
import { TripHistory } from '@/components/TripHistory';

type AppView = 'scanner' | 'review' | 'claiming' | 'settlement' | 'history';

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
  const [isHydrated, setIsHydrated] = useState(false);

  // Callback when server-side SSE sends an updated trip
  const handleTripUpdatedFromServer = useCallback((updated: Trip) => {
    setActiveTrip((prev) => {
      // Prevent stale overwrite if user already moved to settlement
      if (prev?.id === updated.id) {
        saveActiveTrip(updated);
        return updated;
      }
      return prev;
    });
  }, []);

  // Real-time synchronization hook
  const { broadcastTripUpdate, syncStatus } = useTripSync({
    trip: activeTrip,
    onTripUpdated: handleTripUpdatedFromServer,
  });

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

      // Sync latest household from server
      try {
        const hhRes = await fetch('/api/household');
        if (hhRes.ok) {
          const serverHousehold: Household = await hhRes.json();
          setHousehold(serverHousehold);
          saveHousehold(serverHousehold);
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
      await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Error saving household to server:', err);
    }
  };

  // Update trip locally and broadcast to connected roommates
  const handleUpdateTrip = (updated: Trip) => {
    setActiveTrip(updated);
    saveActiveTrip(updated);
    broadcastTripUpdate(updated);
  };

  const handleSelectParticipant = (id: string) => {
    setActiveParticipantId(id);
    saveActiveParticipantId(id);
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
    setView('review');

    // Save to server database immediately
    try {
      await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTrip),
      });
    } catch (err) {
      console.error('Failed to create trip on server:', err);
    }
  };

  const handleConfirmReview = () => {
    if (!activeTrip) return;
    const updated = { ...activeTrip, status: 'claiming' as const };
    handleUpdateTrip(updated);
    setView('claiming');
  };

  const handleArchiveCurrentTrip = async () => {
    if (!activeTrip) return;
    const settledTrip: Trip = { ...activeTrip, status: 'settled' };
    archiveTrip(settledTrip);
    setTripHistory(loadTripHistory());
    setActiveTrip(null);
    saveActiveTrip(null);
    window.history.replaceState({}, '', window.location.pathname);
    setView('history');

    try {
      await fetch(`/api/trips/${encodeURIComponent(settledTrip.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
    } catch (err) {
      console.error('Error archiving trip on server:', err);
    }
  };

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Loading GrocerySplit...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Header
        household={household}
        activeView={view}
        hasActiveTrip={Boolean(activeTrip && (view === 'claiming' || view === 'settlement' || view === 'review'))}
        onNewTrip={handleNewTrip}
        onOpenHistory={() => setView('history')}
        onOpenHousehold={() => setIsHouseholdModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
      />

      <main className="flex-1">
        {view === 'scanner' && (
          <ReceiptScanner
            household={household}
            onTripScanned={handleTripScanned}
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
            activeParticipantId={activeParticipantId}
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
            onSelectTrip={(selected) => {
              setActiveTrip(selected);
              saveActiveTrip(selected);
              setView('settlement');
            }}
            onBackToActive={() => {
              if (activeTrip) {
                setView(activeTrip.status === 'review' ? 'review' : 'claiming');
              } else {
                setView('scanner');
              }
            }}
          />
        )}
      </main>

      {/* Household & Settings Modals */}
      <HouseholdModal
        isOpen={isHouseholdModalOpen}
        household={household}
        isFirstTime={isFirstTimeSetup}
        onClose={() => setIsHouseholdModalOpen(false)}
        onSave={handleUpdateHousehold}
      />

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
