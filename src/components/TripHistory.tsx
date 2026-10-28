'use client';

import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Trip, Household, Participant } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { sortTripHistory } from '@/lib/trip-history';
import { Avatar } from './Avatar';
import { TRIP_STATUS_LABEL, formatRunDate } from './ScannerHome';

interface TripHistoryProps {
  history: Trip[];
  household: Household;
  onSelectTrip: (trip: Trip) => void;
  onBackToActive: () => void;
}

const UNKNOWN_PAYER: Participant = { id: 'unknown', name: 'Roommate', avatarEmoji: '', color: '', venmoHandle: '' };

export function TripHistory({
  history,
  household,
  onSelectTrip,
  onBackToActive,
}: TripHistoryProps) {
  const sortedHistory = React.useMemo(() => sortTripHistory(history || []), [history]);

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

      {sortedHistory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-base font-medium text-slate-900">No runs yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Scan a receipt or open a sample, and it shows up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedHistory.map((trip) => {
            const payer =
              household.participants.find((p) => p.id === trip.payerId) ||
              household.participants[0] || { ...UNKNOWN_PAYER, id: trip.payerId || 'unknown' };
            const summary = calculateTripSettlement(trip, household);
            const totalBill = typeof summary.totalBill === 'number' && !Number.isNaN(summary.totalBill)
              ? summary.totalBill
              : 0;
            const itemsCount = Array.isArray(trip.items) ? trip.items.length : 0;

            return (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => onSelectTrip(trip)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-400 cursor-pointer"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar participant={payer} size="lg" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium text-slate-900">{trip.storeName || 'Grocery store'}</span>
                        <span className={`status-pill status-pill-${trip.status}`}>{TRIP_STATUS_LABEL[trip.status] ?? trip.status}</span>
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
