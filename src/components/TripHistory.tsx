'use client';

import React from 'react';
import { ArrowLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Trip, Household, Participant } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { sortTripHistory } from '@/lib/trip-history';
import { selectTripsForExport } from '@/lib/export-csv';
import { ExportCsv } from '@/components/ExportCsv';
import { Avatar } from './Avatar';
import { TRIP_STATUS_LABEL, formatRunDate } from './ScannerHome';

interface TripHistoryProps {
  history: Trip[];
  household: Household;
  activeParticipantId?: string;
  hiddenTripIds?: string[];
  onToggleHidden?: (tripId: string) => void;
  onSelectTrip: (trip: Trip) => void;
  onBackToActive: () => void;
}

const UNKNOWN_PAYER: Participant = { id: 'unknown', name: 'Roommate', avatarEmoji: '', color: '', venmoHandle: '' };

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

  const linkButtonClass = 'rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBackToActive}
          className="mb-1 flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">Trip history</h1>
        <p className="text-sm text-slate-500">
          {sortedHistory.length
            ? `${sortedHistory.length} ${sortedHistory.length === 1 ? 'run' : 'runs'}, newest first.`
            : 'Every grocery run you scan is kept here.'}
        </p>
      </div>

      <ExportCsv history={exportTrips} household={household} participantId={activeParticipantId} />

      {sortedHistory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-base font-medium text-slate-900">No runs yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Scan a receipt or open a sample, and it shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-500">
            <span>
              {exportTrips.length} of {visibleHistory.length} runs checked for export
              <span className="mx-1.5" aria-hidden="true">·</span>
              <button type="button" onClick={() => setDeselectedIds([])} className={linkButtonClass}>
                Select all
              </button>
              <span className="mx-1.5" aria-hidden="true">·</span>
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
                {showHidden ? 'Hide hidden runs' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'run' : 'runs'}`}
              </button>
            )}
          </div>

          {listedHistory.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              All runs are hidden.
            </p>
          )}
          <ul className="space-y-3">
            {listedHistory.map((trip) => {
              const isHidden = hiddenSet.has(trip.id);
              const storeLabel = trip.storeName || 'Grocery store';
              const dateLabel = trip.date ? formatRunDate(trip.date) : 'unknown date';
              const payer =
                household.participants.find((p) => p.id === trip.payerId) ||
                household.participants[0] || { ...UNKNOWN_PAYER, id: trip.payerId || 'unknown' };
              const summary = calculateTripSettlement(trip, household);
              const totalBill = typeof summary.totalBill === 'number' && !Number.isNaN(summary.totalBill)
                ? summary.totalBill
                : 0;
              const itemsCount = Array.isArray(trip.items) ? trip.items.length : 0;

              return (
                <li
                  key={trip.id}
                  className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-3 pr-1.5 transition-colors hover:border-slate-400 ${isHidden ? 'opacity-60' : ''}`}
                >
                  {!isHidden && (
                    <input
                      type="checkbox"
                      aria-label={`Include ${storeLabel} on ${dateLabel} in export`}
                      checked={!deselectedIds.includes(trip.id)}
                      onChange={() => toggleDeselected(trip.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-primary-600"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectTrip(trip)}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl py-4 pl-1 text-left cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar participant={payer} size="lg" />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-medium text-slate-900">{storeLabel}</span>
                          {isHidden ? (
                            <span className="status-pill status-pill-settled">Hidden</span>
                          ) : (
                            <span className={`status-pill status-pill-${trip.status}`}>{TRIP_STATUS_LABEL[trip.status] ?? trip.status}</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-500">
                          {trip.date ? formatRunDate(trip.date) : '–'} · {payer.name} paid · {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                        </span>
                      </span>
                    </span>

                    <span className="flex flex-none items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900 num">${totalBill.toFixed(2)}</span>
                      <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </button>
                  {onToggleHidden && (
                    <button
                      type="button"
                      aria-label={`${isHidden ? 'Unhide' : 'Hide'} ${storeLabel} on ${dateLabel}`}
                      title={isHidden ? 'Unhide run' : 'Hide run (also leaves it out of exports)'}
                      onClick={() => onToggleHidden(trip.id)}
                      className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      {isHidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
