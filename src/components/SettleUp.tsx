'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, CircleCheck, Send } from 'lucide-react';
import type { Household, Trip } from '@/types';
import { combineUnpaidBalances, selectTripsWithMissingPayer, selectUnpaidTrips, createTripStatusLookup } from '@/lib/combined-balances';
import type { PaidShares, SharePayment } from '@/lib/payments';
import { sortTripHistory } from '@/lib/trip-history';
import { Avatar } from './Avatar';
import { formatRunDate } from './ScannerHome';

interface SettleUpProps {
  history: Trip[];
  household: Household;
  paidShares: PaidShares;
  hiddenTripIds: string[];
  activeParticipantId?: string;
  refreshing?: boolean;
  onRecordPayments: (payments: SharePayment[]) => Promise<boolean>;
  onSelectTrip: (trip: Trip) => void;
  onBack: () => void;
}

const money = (value: number) => `$${value.toFixed(2)}`;

// One question: what single payment does each roommate send to clear every unpaid run?
export function SettleUp({
  history,
  household,
  paidShares,
  hiddenTripIds,
  activeParticipantId,
  refreshing = false,
  onRecordPayments,
  onSelectTrip,
  onBack,
}: SettleUpProps) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  const statusFor = React.useMemo(() => createTripStatusLookup(household, paidShares), [household, paidShares]);
  const unpaidTrips = React.useMemo(
    () => sortTripHistory(selectUnpaidTrips(history, household, paidShares, hiddenTripIds, statusFor)),
    [history, household, paidShares, hiddenTripIds, statusFor]
  );
  const payments = React.useMemo(
    () => combineUnpaidBalances(unpaidTrips, household, paidShares, statusFor),
    [unpaidTrips, household, paidShares, statusFor]
  );
  const toSend = payments.filter((p) => p.amount > 0).length;
  const payerLeft = React.useMemo(
    () => selectTripsWithMissingPayer(history, household, hiddenTripIds),
    [history, household, hiddenTripIds]
  );
  // The roommate using this device sees their own payments first.
  const ordered = React.useMemo(() => {
    const involves = (p: (typeof payments)[number]) => p.from.id === activeParticipantId || p.to.id === activeParticipantId;
    return [...payments].sort((a, b) => Number(involves(b)) - Number(involves(a)));
  }, [payments, activeParticipantId]);
  const openCount = unpaidTrips.filter((trip) => trip.status === 'claiming').length;

  const markPaid = async (key: string, shares: SharePayment[]) => {
    setSaving(key);
    try {
      await onRecordPayments(shares);
    } finally {
      setSaving(null);
    }
  };

  const handleMarkAll = () => {
    const count = unpaidTrips.length;
    if (!confirm(`Mark everyone on ${count} ${count === 1 ? 'trip' : 'trips'} as paid? Do this once every payment above has been sent.`)) return;
    markPaid(
      'all',
      unpaidTrips.flatMap((trip) =>
        statusFor(trip).unpaid.map((d) => ({
          tripId: trip.id,
          participantId: d.participant.id,
          cents: d.owedCents,
        }))
      )
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-20">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-1 flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-[28px]">Settle up</h1>
        <p className="mt-1 text-sm text-slate-500">
          {unpaidTrips.length === 0
            ? payerLeft.length > 0
              ? 'Nothing to combine.'
              : 'Every trip is paid out.'
            : `${unpaidTrips.length} unpaid ${unpaidTrips.length === 1 ? 'trip' : 'trips'}, combined into ${toSend} ${toSend === 1 ? 'payment' : 'payments'}.`}
        </p>
      </div>

      {refreshing && <p role="status" className="mb-4 text-sm text-slate-500">Refreshing trips…</p>}

      {payerLeft.length > 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {payerLeft.length} {payerLeft.length === 1 ? 'trip is' : 'trips are'} left out because whoever paid is no longer in the
          household: {payerLeft.map((trip) => trip.storeName || 'Grocery store').join(', ')}.
        </p>
      )}

      {unpaidTrips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-positive" aria-hidden="true" />
          <h2 className="text-base font-medium text-slate-900">Nothing to pay</h2>
          <p className="mt-1 text-sm text-slate-500">Trips show up here until they are marked as paid out.</p>
        </div>
      ) : (
        <>
          {openCount > 0 && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {openCount} {openCount === 1 ? 'trip is' : 'trips are'} still open for claims, so these amounts can still change.
            </p>
          )}

          <h2 className="sr-only">Payments</h2>
          {ordered.length > 0 && (
            <ul className="mb-6 space-y-3">
              {ordered.map((payment) => {
                const key = `${payment.from.id}-${payment.to.id}`;
                const isExpanded = expanded === key;
                const drawerId = `settle-trips-${key}`;
                const link = payment.venmoDeepLink || payment.venmoWebLink;
                const isEven = payment.amount === 0;
                return (
                  <li key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar participant={payment.from} />
                        <ArrowRight className="h-4 w-4 flex-none text-slate-500" aria-hidden="true" />
                        <Avatar participant={payment.to} />
                        <div className="ml-1 min-w-0">
                          <p className="text-base font-medium text-slate-900">
                            {isEven ? `${payment.from.name} and ${payment.to.name} are even` : `${payment.from.name} pays ${payment.to.name}`}
                          </p>
                          <p className="text-sm text-slate-500">
                            {payment.trips.length} {payment.trips.length === 1 ? 'trip' : 'trips'}
                            {isEven ? ' · nothing to send' : !link && ` · ${payment.to.name} has no Venmo handle`}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-none items-center gap-3">
                        {!isEven && <p className="text-xl font-semibold text-slate-900 num">{money(payment.amount)}</p>}
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Venmo: ${payment.from.name} pays ${payment.to.name} ${money(payment.amount)}`}
                            className="flex items-center gap-1.5 rounded-full bg-[#0074DE] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#005FB8] active:scale-95 transition-colors"
                          >
                            <Send className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Venmo</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => markPaid(key, payment.settles)}
                          disabled={saving !== null}
                          aria-label={
                            isEven
                              ? `Mark ${payment.from.name} and ${payment.to.name} as settled`
                              : `Mark ${payment.from.name}'s ${money(payment.amount)} to ${payment.to.name} as paid`
                          }
                          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
                        >
                          <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{saving === key ? 'Saving…' : isEven ? 'Settled' : 'Paid'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : key)}
                          aria-expanded={isExpanded}
                          aria-controls={drawerId}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} trips in ${payment.from.name}'s payment to ${payment.to.name}`}
                          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <ul id={drawerId} className="space-y-1.5 border-t border-slate-200 bg-slate-50 p-4 text-sm">
                        {payment.trips.map((share) => (
                          <li key={share.tripId} className="flex items-center justify-between gap-3 text-slate-800">
                            <span>
                              {share.storeName || 'Grocery store'}
                              <span className="text-slate-500"> · {share.date ? formatRunDate(share.date) : 'no date'}</span>
                              {share.amount < 0 && (
                                <span className="text-slate-500"> · {payment.to.name} owed {payment.from.name}</span>
                              )}
                            </span>
                            <span className={`font-medium num ${share.amount < 0 ? 'text-positive' : 'text-slate-900'}`}>
                              {share.amount < 0 ? `-${money(-share.amount)}` : money(share.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <section aria-labelledby="settle-trips-heading" className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="settle-trips-heading" className="text-base font-medium text-slate-900">Trips in these payments</h2>
                <p className="text-sm text-slate-500">A trip leaves this page once everyone on it has paid.</p>
              </div>
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={saving !== null}
                className="flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-500 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{saving === 'all' ? 'Saving…' : `Mark ${unpaidTrips.length === 1 ? 'trip' : `all ${unpaidTrips.length}`} as paid`}</span>
              </button>
            </div>
            <ul className="divide-y divide-slate-200">
              {unpaidTrips.map((trip) => {
                const payer = household.participants.find((p) => p.id === trip.payerId);
                const { unpaid, paidCount, debts } = statusFor(trip);
                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTrip(trip)}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm cursor-pointer hover:text-slate-900"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{trip.storeName || 'Grocery store'}</span>
                        <span className="text-slate-500">
                          {' '}· {trip.date ? formatRunDate(trip.date) : 'no date'}{payer ? ` · ${payer.name} paid` : ''}
                        </span>
                        <span className="mt-0.5 block text-slate-500">
                          {paidCount > 0 ? `${paidCount} of ${debts.length} paid · ` : ''}
                          {unpaid.map((d) => d.participant.name).join(', ')} still {unpaid.length === 1 ? 'owes' : 'owe'}
                        </span>
                      </span>
                      {trip.status === 'claiming' && <span className="status-pill status-pill-claiming">Claiming</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
