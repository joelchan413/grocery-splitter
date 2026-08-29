'use client';

import React, { useState, useEffect } from 'react';
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
import { Header } from '@/components/Header';
import { HouseholdModal } from '@/components/HouseholdModal';
import { SettingsModal } from '@/components/SettingsModal';
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
  const [tripHistory, setTripHistory] = useState<Trip[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize from LocalStorage
  useEffect(() => {
    const savedHousehold = loadHousehold();
    const savedTrip = loadActiveTrip();
    const savedHistory = loadTripHistory();
    const savedActiveP = loadActiveParticipantId();
    const initialized = isHouseholdInitialized();

    setHousehold(savedHousehold);
    setActiveTrip(savedTrip);
    setTripHistory(savedHistory);
    setActiveParticipantId(savedActiveP);

    if (!initialized) {
      setIsHouseholdModalOpen(true);
      setIsFirstTimeSetup(true);
    }

    if (savedTrip) {
      if (savedTrip.status === 'review') {
        setView('review');
      } else if (savedTrip.status === 'settled') {
        setView('settlement');
      } else {
        setView('claiming');
      }
    }

    setIsHydrated(true);
  }, []);

  // Save changes to storage
  const handleUpdateHousehold = (updated: Household) => {
    setHousehold(updated);
    saveHousehold(updated);
    setHouseholdInitialized(true);
    setIsFirstTimeSetup(false);
  };

  const handleUpdateTrip = (updated: Trip) => {
    setActiveTrip(updated);
    saveActiveTrip(updated);
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
    setView('scanner');
  };

  const handleTripScanned = (newTrip: Trip) => {
    setActiveTrip(newTrip);
    saveActiveTrip(newTrip);
    setView('review');
  };

  const handleConfirmReview = () => {
    if (!activeTrip) return;
    const updated = { ...activeTrip, status: 'claiming' as const };
    setActiveTrip(updated);
    saveActiveTrip(updated);
    setView('claiming');
  };

  const handleArchiveCurrentTrip = () => {
    if (!activeTrip) return;
    const settledTrip: Trip = { ...activeTrip, status: 'settled' };
    archiveTrip(settledTrip);
    setTripHistory(loadTripHistory());
    setActiveTrip(null);
    saveActiveTrip(null);
    setView('history');
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
        onNewTrip={handleNewTrip}
        onOpenHistory={() => setView('history')}
        onOpenHousehold={() => setIsHouseholdModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
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
    </div>
  );
}
