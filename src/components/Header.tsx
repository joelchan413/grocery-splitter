'use client';

import React from 'react';
import { ShoppingBag, Users, History, PlusCircle, Settings, QrCode } from 'lucide-react';
import { Household } from '@/types';

interface HeaderProps {
  household: Household;
  activeView: 'scanner' | 'review' | 'claiming' | 'settlement' | 'history';
  hasActiveTrip?: boolean;
  onNewTrip: () => void;
  onOpenHistory: () => void;
  onOpenHousehold: () => void;
  onOpenSettings: () => void;
  onOpenShare?: () => void;
}

// A top bar on phones and tablets; a labelled sidebar on the page ground from 1101px (see app.css).
export function Header({
  household,
  activeView,
  hasActiveTrip = false,
  onNewTrip,
  onOpenHistory,
  onOpenHousehold,
  onOpenSettings,
  onOpenShare,
}: HeaderProps) {
  const roommates = household.participants.length;

  return (
    <header className="app-header">
      <div className="app-brand">
        <ShoppingBag className="app-mark" aria-hidden="true" />
        <div className="min-w-0">
          <span className="app-wordmark">GrocerySplit</span>
          <button type="button" onClick={onOpenHousehold} className="app-household" title="Edit household">
            <Users aria-hidden="true" />
            <span>{household.name}</span>
            <span className="app-household-count">{roommates} {roommates === 1 ? 'roommate' : 'roommates'}</span>
          </button>
        </div>
      </div>

      <nav className="app-nav" aria-label="Main">
        <button
          type="button"
          onClick={onNewTrip}
          aria-current={activeView === 'scanner' ? 'page' : undefined}
          aria-label="New trip"
          title="New trip"
          className="app-nav-item app-nav-new"
        >
          <PlusCircle aria-hidden="true" />
          <span className="app-nav-label">New trip</span>
        </button>

        {hasActiveTrip && onOpenShare && (
          <button type="button" onClick={onOpenShare} className="app-nav-item" aria-label="Share live trip" title="Share live trip">
            <QrCode aria-hidden="true" />
            <span className="app-nav-label">Share live</span>
            <span className="app-nav-live" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenHistory}
          aria-current={activeView === 'history' ? 'page' : undefined}
          className="app-nav-item"
          aria-label="History"
          title="Trip history"
        >
          <History aria-hidden="true" />
          <span className="app-nav-label">History</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="app-nav-item app-nav-settings"
          aria-label="Settings"
          title="Receipt scanning settings"
        >
          <Settings aria-hidden="true" />
          <span className="app-nav-label">Settings</span>
        </button>
      </nav>
    </header>
  );
}
