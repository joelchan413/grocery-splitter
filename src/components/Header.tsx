'use client';

import React from 'react';
import { ShoppingBag, Users, History, PlusCircle, Settings, QrCode, Radio } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand & Household Name */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white">GrocerySplit</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                v1.0
              </span>
            </div>
            <button
              onClick={onOpenHousehold}
              className="group flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 cursor-pointer"
            >
              <Users className="h-3 w-3" />
              <span>{household.name}</span>
              <span className="text-[10px] text-slate-400">({household.participants.length} roommates)</span>
            </button>
          </div>
        </div>

        {/* Navigation & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {hasActiveTrip && onOpenShare && (
            <button
              onClick={onOpenShare}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 transition-all cursor-pointer"
              title="Share live room with roommates"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <QrCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share Live</span>
            </button>
          )}

          <button
            onClick={onOpenHistory}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'history'
                ? 'bg-slate-100 text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
            title="Trip History"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-all cursor-pointer"
            title="Settings & API Key"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={onNewTrip}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Trip</span>
          </button>
        </div>
      </div>
    </header>
  );
}
