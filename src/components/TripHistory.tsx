'use client';

import React from 'react';
import { ChevronRight, CircleCheck, CircleDollarSign, Eye, EyeOff, HandCoins } from 'lucide-react';
import { Trip, Household, Participant } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import { sortTripHistory } from '@/lib/trip-history';
import { selectTripsForExport } from '@/lib/export-csv';
import { ExportCsv } from '@/components/ExportCsv';
import { isPaidOutState, isUnpaidState, tripPaymentStatus } from '@/lib/combined-balances';
import type { PaidShares, ShareRef, SharePayment } from '@/lib/payments';
import { Avatar } from './Avatar';
import { TRIP_STATUS_LABEL, formatRunDate } from './ScannerHome';
import { useConfirm } from './ConfirmDialog';
import { BackToTrip } from './TripLayout';

interface TripHistoryProps {
  history: Trip[];
  refreshing?: boolean;
  household: Household;
  activeParticipantId?: string;
  hiddenTripIds?: string[];
  onToggleHidden?: (tripId: string) => void;
  paidShares?: PaidShares;
  onRecordPayments?: (payments: SharePayment[]) => void;
  onClearPayments?: (shares: ShareRef[]) => void;
  onOpenSettleUp?: () => void;
  onSelectTrip: (trip: Trip) => void;
  /** The run still in progress, if any. */
  openTrip?: { name: string; onOpen: () => void };
}

const UNKNOWN_PAYER: Participant = { id: 'unknown', name: 'Roommate', avatarEmoji: '', color: '', venmoHandle: '' };

export function TripHistory({
  history,
  refreshing = false,
  household,
  activeParticipantId,
  hiddenTripIds = [],
  onToggleHidden,
  paidShares = {},
  onRecordPayments,
  onClearPayments,
  onOpenSettleUp,
  onSelectTrip,
  openTrip,
}: TripHistoryProps) {
  const confirm = useConfirm();
  const sortedHistory = React.useMemo(() => sortTripHistory(history || []), [history]);
  const [showHidden, setShowHidden] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(50);
  // Trips are included in the export unless unchecked, so new trips default to included.
  const [deselectedIds, setDeselectedIds] = React.useState<string[]>([]);

  const hiddenSet = React.useMemo(() => new Set(hiddenTripIds), [hiddenTripIds]);
  const summaries = React.useMemo(
    () => new Map(sortedHistory.map((trip) => [trip.id, calculateTripSettlement(trip, household)])),
    [sortedHistory, household]
  );
  const paymentStatus = React.useMemo(
    () => new Map(sortedHistory.map((trip) => [trip.id, tripPaymentStatus(trip, household, paidShares, summaries.get(trip.id))])),
    [sortedHistory, household, paidShares, summaries]
  );
  const visibleHistory = React.useMemo(
    () => sortedHistory.filter((trip) => !hiddenSet.has(trip.id)),
    [sortedHistory, hiddenSet]
  );
  const hiddenCount = sortedHistory.length - visibleHistory.length;
  // Counted the way Settle up counts, so the banner never promises runs it can't combine.
  const unpaidCount = visibleHistory.filter((trip) => isUnpaidState(paymentStatus.get(trip.id)!.state)).length;
  const listedHistory = showHidden ? sortedHistory : visibleHistory;
  const exportTrips = React.useMemo(
    () => selectTripsForExport(sortedHistory, hiddenTripIds, deselectedIds),
    [sortedHistory, hiddenTripIds, deselectedIds]
  );

  const toggleDeselected = (tripId: string) =>
    setDeselectedIds((prev) => (prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]));

  const linkButtonClass = 'rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer';

  return (
    <div className="screen">
      <div className="mb-6">
        <BackToTrip trip={openTrip} />
        <h1 className="screen-title">Trip history</h1>
        <p className="screen-lede">
          {sortedHistory.length
            ? `${sortedHistory.length} ${sortedHistory.length === 1 ? 'run' : 'runs'}, newest first.`
            : 'Every grocery run you scan is kept here.'}
        </p>
      </div>

      {refreshing && <p role="status" className="mb-4 text-sm text-slate-500">Refreshing history…</p>}

      {onOpenSettleUp && unpaidCount > 0 && (
        <button
          type="button"
          onClick={onOpenSettleUp}
          className="card mb-6 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-slate-400 sm:px-5"
        >
          <span className="flex items-center gap-3">
            <HandCoins className="h-5 w-5 flex-none text-slate-500" aria-hidden="true" />
            <span>
              <span className="block text-base font-medium text-slate-900">
                {unpaidCount} unpaid {unpaidCount === 1 ? 'run' : 'runs'}
              </span>
              <span className="block text-sm text-slate-500">Settle up with one payment per roommate</span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </button>
      )}

      {sortedHistory.length === 0 && refreshing ? null : sortedHistory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-base font-medium text-slate-900">No runs yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Scan a receipt, and it shows up here.
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
            {listedHistory.slice(0, visibleCount).map((trip) => {
              const isHidden = hiddenSet.has(trip.id);
              const payments = paymentStatus.get(trip.id);
              const state = payments?.state ?? 'checking';
              const canMarkPaid = isUnpaidState(state) || state === 'paid-out';
              // A run nobody owes on is paid out too, though there is nothing to mark.
              const isPaid = isPaidOutState(state);
              const isPartlyPaid = state === 'partly-paid';
              const storeLabel = trip.storeName || 'Grocery store';
              const dateLabel = trip.date ? formatRunDate(trip.date) : 'unknown date';
              const payer =
                household.participants.find((p) => p.id === trip.payerId) ||
                household.participants[0] || { ...UNKNOWN_PAYER, id: trip.payerId || 'unknown' };
              const summary = summaries.get(trip.id)!;
              const totalBill = typeof summary.totalBill === 'number' && !Number.isNaN(summary.totalBill)
                ? summary.totalBill
                : 0;
              const itemsCount = Array.isArray(trip.items) ? trip.items.length : 0;

              return (
                <li
                  key={trip.id}
                  className={`card flex items-center gap-1 pl-3 pr-1 transition-colors hover:border-slate-400 sm:gap-2 sm:pl-4 sm:pr-2 ${isHidden ? 'opacity-60' : ''}`}
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
                    className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl py-3.5 pl-2 text-left cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar participant={payer} size="lg" className="hidden sm:inline-grid" />
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 truncate text-base font-medium text-slate-900">{storeLabel}</span>
                          {isHidden ? (
                            <span className="status-pill status-pill-settled">Hidden</span>
                          ) : isPaid ? (
                            <span className="status-pill status-pill-paid">Paid out</span>
                          ) : isPartlyPaid && payments ? (
                            <span className="status-pill status-pill-review">{payments.paidCount} of {payments.debts.length} paid</span>
                          ) : (
                            <span className={`status-pill status-pill-${trip.status}`}>{TRIP_STATUS_LABEL[trip.status] ?? trip.status}</span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-slate-500">
                          {trip.date ? formatRunDate(trip.date) : '–'} · {payer.name} paid<span className="hidden sm:inline"> · {itemsCount} {itemsCount === 1 ? 'item' : 'items'}</span>
                        </span>
                      </span>
                    </span>

                    <span className="flex flex-none items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900 num">${totalBill.toFixed(2)}</span>
                      <ChevronRight className="hidden h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden="true" />
                    </span>
                  </button>
                  {onRecordPayments && onClearPayments && canMarkPaid && payments && (
                    <button
                      type="button"
                      aria-pressed={isPaid}
                      aria-label={`${isPaid ? 'Mark unpaid' : 'Mark everyone paid'}: ${storeLabel} on ${dateLabel}`}
                      title={isPaid ? 'Paid out. Click to mark everyone unpaid' : 'Mark everyone on this run as paid'}
                      onClick={async () => {
                        if (!isPaid) {
                          onRecordPayments(payments.unpaid.map((d) => ({ tripId: trip.id, participantId: d.participant.id, cents: d.owedCents })));
                          return;
                        }
                        const ok = await confirm({
                          title: 'Mark everyone as unpaid?',
                          body: `The payments recorded for ${storeLabel} on ${dateLabel} are cleared, and every roommate owes their share again.`,
                          confirmLabel: 'Mark unpaid',
                          tone: 'danger',
                        });
                        if (ok) onClearPayments(payments.debts.map((d) => ({ tripId: trip.id, participantId: d.participant.id })));
                      }}
                      className={`btn btn-quiet btn-icon btn-sm ${isPaid ? 'text-positive!' : ''}`}
                    >
                      {isPaid ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                  {onToggleHidden && (
                    <button
                      type="button"
                      aria-label={`${isHidden ? 'Unhide' : 'Hide'} ${storeLabel} on ${dateLabel}`}
                      title={isHidden ? 'Unhide run' : 'Hide run (also leaves it out of exports)'}
                      onClick={() => onToggleHidden(trip.id)}
                      className="btn btn-quiet btn-icon btn-sm"
                    >
                      {isHidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {listedHistory.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 50)}
              className="mt-4 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Show more runs ({listedHistory.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}

      {/* Export comes after the list, since its checkboxes choose what goes in. */}
      <div className="mt-6">
        <ExportCsv history={exportTrips} household={household} participantId={activeParticipantId} />
      </div>
    </div>
  );
}
