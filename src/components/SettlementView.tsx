'use client';

import React, { useState } from 'react';
import { Send, Copy, Check, Edit3, ChevronDown, ChevronUp, Archive, CircleCheck, CircleDollarSign } from 'lucide-react';
import { Household, Trip } from '@/types';
import { calculateTripSettlement, round2 } from '@/lib/calculations';
import type { PaidShares, ShareRef, SharePayment } from '@/lib/payments';
import { tripPaymentStatus, type TripDebt } from '@/lib/combined-balances';
import confetti from 'canvas-confetti';
import { Avatar } from './Avatar';
import { formatRunDate } from './ScannerHome';

interface SettlementViewProps {
  trip: Trip;
  household: Household;
  onEditClaims: () => void;
  onArchiveTrip: () => void;
  paidShares?: PaidShares;
  onRecordPayments?: (payments: SharePayment[]) => void;
  onClearPayments?: (shares: ShareRef[]) => void;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export function SettlementView({
  trip,
  household,
  onEditClaims,
  onArchiveTrip,
  paidShares = {},
  onRecordPayments,
  onClearPayments,
}: SettlementViewProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);

  const summary = calculateTripSettlement(trip, household);
  const payer = summary.payer;
  const splitWays = household.participants.length;

  // The payer's figure is summed from the rounded amounts shown on each roommate's row.
  const totalReimbursement = round2(
    summary.participants.filter((p) => !p.isPayer).reduce((acc, p) => acc + p.netOwed, 0)
  );

  // Payments are only tracked while whoever paid is still in the household.
  const payments = tripPaymentStatus(trip, household, paidShares);
  const tracksPayments = Boolean(onRecordPayments && onClearPayments) && !payments.payerMissing && payments.debts.length > 0;
  const debtFor = (participantId: string) => payments.debts.find((d) => d.participant.id === participantId);
  const isPaidOut = payments.isPaidOut && payments.debts.length > 0;
  const receivedCents = payments.debts.reduce((acc, d) => acc + Math.min(d.paidCents, d.owedCents), 0);
  // Marking paid records each roommate's full share as it stands now.
  const markPaid = (debts: TripDebt[]) =>
    onRecordPayments?.(debts.map((d) => ({ tripId: trip.id, participantId: d.participant.id, cents: d.owedCents })));
  const markUnpaid = (debts: TripDebt[]) =>
    onClearPayments?.(debts.map((d) => ({ tripId: trip.id, participantId: d.participant.id })));

  const handleCopySummary = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summary.groupChatSummary);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopiedSummary(true);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 }, disableForReducedMotion: true });
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = summary.groupChatSummary;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2500);
      } catch (fallbackErr) {
        console.error(fallbackErr);
      }
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedParticipantId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-20">
      {/* Title row: the run, its date and its total */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-[28px]">
          {summary.storeName || 'Grocery run'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Balances for the {formatRunDate(summary.date)} run · total <span className="font-medium text-slate-900 num">{money(summary.totalBill)}</span>
        </p>
      </div>

      {/* The payer and what they get back: the screen's answer */}
      <section aria-label="Payer" className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar participant={payer} size="lg" />
          <div>
            <p className="text-base font-medium text-slate-900">{payer.name} paid the bill</p>
            <p className="text-sm text-slate-500">Venmo {payer.venmoHandle || 'not set'}</p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-slate-500">{payer.name} gets back</p>
          <p className="text-[32px] font-semibold leading-tight text-positive num">+{money(totalReimbursement)}</p>
          {tracksPayments && (
            <p className="text-sm text-slate-500">
              {isPaidOut
                ? 'Everyone has paid'
                : `${money(receivedCents / 100)} received · ${payments.paidCount} of ${payments.debts.length} paid`}
            </p>
          )}
        </div>
      </section>

      {payments.payerMissing && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Whoever paid for this trip is no longer in the household, so there is nobody to send money to and payments
          aren&apos;t tracked here.
        </p>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onEditClaims}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 cursor-pointer"
        >
          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Edit claims</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {tracksPayments && (
            <button
              type="button"
              onClick={() => {
                if (!isPaidOut) return markPaid(payments.unpaid);
                if (confirm('Mark everyone on this trip as unpaid?')) markUnpaid(payments.debts);
              }}
              aria-pressed={isPaidOut}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${isPaidOut ? 'border-transparent bg-positive-soft text-positive' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
            >
              {isPaidOut ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{isPaidOut ? 'Paid out' : 'Mark everyone paid'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopySummary}
            aria-live="polite"
            className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {copiedSummary ? (
              <>
                <Check className="h-3.5 w-3.5 text-positive" aria-hidden="true" />
                <span>Summary copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy summary for the group chat</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onArchiveTrip}
            className="flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-500 transition-colors cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Finish and archive</span>
          </button>
        </div>
      </div>

      {/* One row per roommate */}
      <h2 className="sr-only">Each roommate&apos;s share</h2>
      <ul className="space-y-3">
        {summary.participants.map((p) => {
          const isExpanded = expandedParticipantId === p.participantId;
          const drawerId = `settlement-items-${p.participantId}`;
          const shown = p.isPayer ? p.ownShare : p.netOwed;
          const adjustment = round2(shown - (p.itemsShare + p.taxAttributed - p.basketDiscountShare));
          const debt = tracksPayments ? debtFor(p.participantId) : undefined;
          const owes = !p.isPayer && p.netOwed > 0;
          const paid = Boolean(debt && debt.remainingCents === 0);
          // Paid before the share grew: only the difference is still owed.
          const stillOwed = debt && debt.paidCents > 0 && debt.remainingCents > 0 ? debt.remainingCents / 100 : null;
          const venmoLink = (p.venmoDeepLink || p.venmoWebLink).replace(/([?&]amount=)[\d.]+/, `$1${(stillOwed ?? p.netOwed).toFixed(2)}`);
          return (
            <li key={p.participantId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-[9rem] flex-1 items-center gap-3">
                  <Avatar participant={p.participant} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-slate-900">{p.participant.name}</p>
                    <p className="text-sm text-slate-500">
                      {p.isPayer ? 'Paid the bill · ' : ''}{p.claimedItems.length} own, {p.householdSharedItems.length} shared
                    </p>
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {p.isPayer ? 'Own share' : paid ? `Paid ${payer.name}` : stillOwed !== null ? `Owes ${money(stillOwed)} more` : `Owes ${payer.name}`}
                    </p>
                    <p className={`text-lg font-semibold num ${paid ? 'text-positive' : 'text-slate-900'}`}>{money(shown)}</p>
                  </div>

                  {debt && (
                    <button
                      type="button"
                      onClick={() => (paid ? markUnpaid([debt]) : markPaid([debt]))}
                      aria-pressed={paid}
                      aria-label={`${p.participant.name} has paid ${payer.name}`}
                      title={paid ? 'Paid. Click to mark unpaid' : 'Mark as paid'}
                      className={`flex items-center gap-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${paid ? 'border-transparent bg-positive-soft text-positive' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
                    >
                      {paid ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>Paid</span>
                    </button>
                  )}

                  {owes && !paid && venmoLink && !payments.payerMissing && (
                    <a
                      href={venmoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Venmo: ${p.participant.name} pays ${payer.name} ${money(stillOwed ?? p.netOwed)}`}
                      className="flex items-center gap-1.5 rounded-full bg-[#0074DE] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#005FB8] active:scale-95 transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Venmo</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleExpand(p.participantId)}
                    aria-expanded={isExpanded}
                    aria-controls={drawerId}
                    aria-label={`${isExpanded ? 'Hide' : 'Show'} items for ${p.participant.name}`}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div id={drawerId} className="border-t border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-700">Own items</h3>
                      {p.claimedItems.length === 0 ? (
                        <p className="mt-1 text-slate-500">No items claimed.</p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {p.claimedItems.map((it, idx) => (
                            <li key={idx} className="flex items-center justify-between gap-3 text-slate-800">
                              <span>
                                {it.itemName}{it.claimedQuantity > 1 && <span className="text-slate-500"> × {it.claimedQuantity}</span>}
                                {it.isTaxable && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">Taxed</span>}
                              </span>
                              <span className="font-medium text-slate-900 num">{money(it.priceShare)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-slate-700">Shared items, split {splitWays} ways</h3>
                      {p.householdSharedItems.length === 0 ? (
                        <p className="mt-1 text-slate-500">No shared items.</p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {p.householdSharedItems.map((it, idx) => (
                            <li key={idx} className="flex items-center justify-between gap-3 text-slate-700">
                              <span>{it.itemName}</span>
                              <span className="font-medium text-slate-900 num">{money(it.priceShare)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-slate-600">
                      <div className="flex justify-between gap-3">
                        <dt>Items</dt>
                        <dd className="font-medium text-slate-900 num">{money(p.itemsShare)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Tax <span className="text-slate-500">on {money(p.taxableSubtotal)} of taxed items</span></dt>
                        <dd className="font-medium text-slate-900 num">+{money(p.taxAttributed)}</dd>
                      </div>
                      {p.basketDiscountShare > 0 && (
                        <div className="flex justify-between gap-3">
                          <dt>Basket discount share</dt>
                          <dd className="font-medium text-positive num">-{money(p.basketDiscountShare)}</dd>
                        </div>
                      )}
                      {adjustment !== 0 && (
                        <div className="flex justify-between gap-3">
                          <dt>Adjustment <span className="text-slate-500">so the shares add up to the bill</span></dt>
                          <dd className="font-medium text-slate-900 num">{adjustment > 0 ? '+' : '-'}{money(Math.abs(adjustment))}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
