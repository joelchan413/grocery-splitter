'use client';

import React from 'react';
import { Calendar, ShoppingBag, ArrowLeft, ArrowRight, User } from 'lucide-react';
import { Trip, Household } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';

interface TripHistoryProps {
  history: Trip[];
  household: Household;
  onSelectTrip: (trip: Trip) => void;
  onBackToActive: () => void;
}

export function TripHistory({
  history,
  household,
  onSelectTrip,
  onBackToActive,
}: TripHistoryProps) {
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
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Trip History</h1>
          <p className="text-xs text-slate-500">
            View all scanned grocery runs, active claiming sessions, and settlements.
          </p>
        </div>
      </div>

      {history.length === 0 ? (
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
        <div className="space-y-3">
          {history.map((trip) => {
            const payer =
              household.participants.find((p) => p.id === trip.payerId) ||
              household.participants[0];
            const summary = calculateTripSettlement(trip, household);

            return (
              <div
                key={trip.id}
                onClick={() => onSelectTrip(trip)}
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 text-xl font-bold dark:bg-emerald-950 dark:text-emerald-300">
                    {payer.avatarEmoji}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                        {trip.storeName || 'Grocery Store'}
                      </h3>
                      {trip.status === 'settled' ? (
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
                        <Calendar className="h-3 w-3" /> {trip.date}
                      </span>
                      <span>•</span>
                      <span>Paid by {payer.name}</span>
                      <span>•</span>
                      <span>{trip.items.length} items</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total
                    </span>
                    <span className="text-base font-black text-slate-900 dark:text-white">
                      ${summary.totalBill.toFixed(2)}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
