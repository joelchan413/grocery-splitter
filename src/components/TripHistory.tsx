'use client';

import React from 'react';
import { Calendar, ShoppingBag, ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Trip, Household } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { sortTripHistory } from '@/lib/trip-history';
import { selectTripsForExport } from '@/lib/export-csv';
import { ExportCsv } from '@/components/ExportCsv';

interface TripHistoryProps {
  history: Trip[];
  household: Household;
  activeParticipantId?: string;
  hiddenTripIds?: string[];
  onToggleHidden?: (tripId: string) => void;
  onSelectTrip: (trip: Trip) => void;
  onBackToActive: () => void;
}

export function TripHistory({
  history,
  household,
  activeParticipantId,
  hiddenTripIds = [],
  onToggleHidden,
  onSelectTrip,
  onBackToActive,
}: TripHistoryProps) {
  const sortedHistory = React.useMemo(() => sortTripHistory(history || []), [history]);
  const [showHidden, setShowHidden] = React.useState(false);
  // Trips are included in the export unless unchecked, so new trips default to included.
  const [deselectedIds, setDeselectedIds] = React.useState<string[]>([]);

  const hiddenSet = React.useMemo(() => new Set(hiddenTripIds), [hiddenTripIds]);
  const visibleHistory = React.useMemo(
    () => sortedHistory.filter((trip) => !hiddenSet.has(trip.id)),
    [sortedHistory, hiddenSet]
  );
  const hiddenCount = sortedHistory.length - visibleHistory.length;
  const listedHistory = showHidden ? sortedHistory : visibleHistory;
  const exportTrips = React.useMemo(
    () => selectTripsForExport(sortedHistory, hiddenTripIds, deselectedIds),
    [sortedHistory, hiddenTripIds, deselectedIds]
  );

  const toggleDeselected = (tripId: string) =>
    setDeselectedIds((prev) => (prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]));

  const linkButtonClass =
    'text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={onBackToActive}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Trip History Archive</h1>
          <p className="text-xs text-slate-500">
            View all scanned grocery runs, active claiming sessions, and settlements.
          </p>
        </div>
      </div>

      <ExportCsv history={exportTrips} household={household} participantId={activeParticipantId} />

      {sortedHistory.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Scanned Trips Yet</h3>
          <p className="mt-1 text-xs text-slate-500">
            Once you scan or upload receipts, they will appear here immediately.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-xs text-slate-500">
              {exportTrips.length} of {visibleHistory.length} trips checked for export
              <span className="mx-1.5">·</span>
              <button type="button" onClick={() => setDeselectedIds([])} className={linkButtonClass}>
                Select all
              </button>
              <span className="mx-1.5">·</span>
              <button
                type="button"
                onClick={() => setDeselectedIds(visibleHistory.map((trip) => trip.id))}
                className={linkButtonClass}
              >
                Clear
              </button>
            </span>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => setShowHidden((v) => !v)} className={linkButtonClass}>
                {showHidden ? 'Hide hidden trips' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'trip' : 'trips'}`}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {listedHistory.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
                All trips are hidden.
              </p>
            )}
            {listedHistory.map((trip) => {
              const isHidden = hiddenSet.has(trip.id);
              const storeLabel = trip.storeName || 'Grocery Store';
              const payer =
                household.participants.find((p) => p.id === trip.payerId) ||
                household.participants[0] || {
                  id: trip.payerId || 'unknown',
                  name: 'Roommate',
                  avatarEmoji: '🛒',
                  color: '#2563EB',
                  venmoHandle: '',
                };
              const summary = calculateTripSettlement(trip, household);
              const totalBill = typeof summary.totalBill === 'number' && !Number.isNaN(summary.totalBill)
                ? summary.totalBill
                : 0;
              const itemsCount = Array.isArray(trip.items) ? trip.items.length : 0;

              return (
                <div
                  key={trip.id}
                  onClick={() => onSelectTrip(trip)}
                  className={`group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer dark:border-slate-800 dark:bg-slate-900 ${
                    isHidden ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {!isHidden && (
                      <input
                        type="checkbox"
                        aria-label={`Include ${storeLabel} on ${trip.date || 'unknown date'} in export`}
                        checked={!deselectedIds.includes(trip.id)}
                        onChange={() => toggleDeselected(trip.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
                      />
                    )}
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 text-xl font-bold dark:bg-emerald-950 dark:text-emerald-300">
                      {payer.avatarEmoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                          {storeLabel}
                        </h3>
                        {isHidden ? (
                          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            Hidden
                          </span>
                        ) : trip.status === 'settled' ? (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Settled
                          </span>
                        ) : trip.status === 'review' ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            In Review
                          </span>
                        ) : (
                          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Claiming Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {trip.date || 'Recent Date'}
                        </span>
                        <span>•</span>
                        <span>Paid by {payer.name}</span>
                        <span>•</span>
                        <span>{itemsCount} items</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Total
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        ${totalBill.toFixed(2)}
                      </span>
                    </div>
                    {onToggleHidden && (
                      <button
                        type="button"
                        aria-label={`${isHidden ? 'Unhide' : 'Hide'} ${storeLabel} on ${trip.date || 'unknown date'}`}
                        title={isHidden ? 'Unhide trip' : 'Hide trip (also removes it from exports)'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleHidden(trip.id);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    )}
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
