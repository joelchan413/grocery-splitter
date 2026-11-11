'use client';

import React, { useMemo, useState } from 'react';
import { Send, Copy, Check, ChevronDown, ChevronUp, Archive, CircleCheck, CircleDollarSign } from 'lucide-react';
import { Household, Trip } from '@/types';
import { calculateTripSettlement, round2 } from '@/lib/calculations';
import type { PaidShares, ShareRef, SharePayment } from '@/lib/payments';
import { tripPaymentStatus, type TripDebt } from '@/lib/combined-balances';
import confetti from 'canvas-confetti';
import { Avatar } from './Avatar';
import { formatRunDate } from './ScannerHome';
import { ActionBar, TripSteps } from './TripLayout';
import { useConfirm } from './ConfirmDialog';

interface SettlementViewProps {
  trip: Trip;
  household: Household;
  onEditClaims: () => void;
  onEditItems?: () => void;
  onArchiveTrip: () => void;
  /** Saved receipt photos, shown under the title. */
  photos?: React.ReactNode;
  paidShares?: PaidShares;
  onRecordPayments?: (payments: SharePayment[]) => void;
  onClearPayments?: (shares: ShareRef[]) => void;
}

const money = (value: number) => `$${value.toFixed(2)}`;

export function SettlementView({
  trip,
  household,
  onEditClaims,
  onEditItems,
  onArchiveTrip,
  photos,
  paidShares = {},
  onRecordPayments,
  onClearPayments,
}: SettlementViewProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const confirm = useConfirm();
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);

  const summary = useMemo(() => calculateTripSettlement(trip, household), [trip, household]);
  const payer = summary.payer;
  const splitWays = household.participants.length;

  // The payer's figure is summed from the rounded amounts shown on each roommate's row.
  const totalReimbursement = round2(
    summary.participants.filter((p) => !p.isPayer).reduce((acc, p) => acc + p.netOwed, 0)
  );

  // Payments are only tracked while whoever paid is still in the household.
  const payments = useMemo(
    () => tripPaymentStatus(trip, household, paidShares, summary),
    [trip, household, paidShares, summary]
  );
  const tracksPayments = Boolean(onRecordPayments && onClearPayments) && !payments.payerMissing && payments.debts.length > 0;
  const debtFor = (participantId: string) => payments.debts.find((d) => d.participant.id === participantId);
  const isPaidOut = payments.state === 'paid-out';
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
    <div className="screen has-bar">
      <TripSteps current="settlement" onOpen={{ review: onEditItems, claiming: onEditClaims }} />
      {/* Title row: the run, its date and its total */}
      <div className="mb-6">
        <h1 className="screen-title">{summary.storeName || 'Grocery run'}</h1>
        <p className="screen-lede">
          Balances for the {formatRunDate(summary.date)} run · total <span className="font-medium text-slate-900 num">{money(summary.totalBill)}</span>
        </p>
      </div>
      {photos}

      {/* The payer and what they get back: the screen's answer */}
      <section aria-label="Payer" className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
              <p className="text-sm text-slate-500">
                {isPaidOut
                  ? 'Everyone has paid'
                  : `${money(receivedCents / 100)} received · ${payments.paidCount} of ${payments.debts.length} paid`}
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!isPaidOut) return markPaid(payments.unpaid);
                  const ok = await confirm({
                    title: 'Mark everyone as unpaid?',
                    body: `The payments recorded for ${summary.storeName || 'this trip'} are cleared, and every roommate owes their share again.`,
                    confirmLabel: 'Mark unpaid',
                    tone: 'danger',
                  });
                  if (ok) markUnpaid(payments.debts);
                }}
                aria-pressed={isPaidOut}
                className={`btn btn-sm ${isPaidOut ? 'btn-paid' : 'btn-secondary'}`}
              >
                {isPaidOut ? <CircleCheck aria-hidden="true" /> : <CircleDollarSign aria-hidden="true" />}
                <span>{isPaidOut ? 'Paid out' : 'Mark everyone paid'}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {payments.payerMissing && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Whoever paid for this trip is no longer in the household, so there is nobody to send money to and payments
          aren&apos;t tracked here.
        </p>
      )}

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
          const showVenmo = Boolean(owes && !paid && venmoLink && !payments.payerMissing);
          return (
            <li key={p.participantId} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 p-4 sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar participant={p.participant} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-slate-900">{p.participant.name}</p>
                    <p className="text-sm text-slate-500">
                      {p.claimedItems.length} own · {p.householdSharedItems.length} shared
                    </p>
                  </div>
                  <div className="ml-auto flex-none text-right">
                    <p className="text-[13px] text-slate-500">
                      {p.isPayer ? 'Own share' : paid ? `Paid ${payer.name}` : stillOwed !== null ? `Owes ${money(stillOwed)} more` : `Owes ${payer.name}`}
                    </p>
                    <p className={`text-lg font-semibold num ${paid ? 'text-positive' : 'text-slate-900'}`}>{money(shown)}</p>
                  </div>
                </div>

                {/* Venmo comes first and leaves once paid, so Paid stays put under the thumb. */}
                <div className={`flex items-center justify-end gap-2 ${showVenmo || debt ? 'w-full sm:w-auto' : ''}`}>
                  {showVenmo && (
                    <a
                      href={venmoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Venmo: ${p.participant.name} pays ${payer.name} ${money(stillOwed ?? p.netOwed)}`}
                      className="btn btn-venmo flex-1 sm:flex-none"
                    >
                      <Send aria-hidden="true" />
                      <span>Venmo</span>
                    </a>
                  )}

                  {debt && (
                    <button
                      type="button"
                      onClick={() => (paid ? markUnpaid([debt]) : markPaid([debt]))}
                      aria-pressed={paid}
                      aria-label={`${p.participant.name} has paid ${payer.name}`}
                      title={paid ? 'Paid. Click to mark unpaid' : 'Mark as paid'}
                      className={`btn flex-1 sm:flex-none ${paid ? 'btn-paid' : 'btn-secondary'}`}
                    >
                      {paid ? <CircleCheck aria-hidden="true" /> : <CircleDollarSign aria-hidden="true" />}
                      <span>Paid</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleExpand(p.participantId)}
                    aria-expanded={isExpanded}
                    aria-controls={drawerId}
                    aria-label={`${isExpanded ? 'Hide' : 'Show'} items for ${p.participant.name}`}
                    className="btn btn-quiet btn-icon"
                  >
                    {isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Always rendered so aria-controls points at a real element; hidden while closed. */}
                <div id={drawerId} hidden={!isExpanded} className="border-t border-[var(--rule)] bg-[var(--ground)] p-4 text-[15px] sm:px-5">
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
                                {it.isTaxable && <span className="tag-taxed ml-1.5">Taxed</span>}
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
            </li>
          );
        })}
      </ul>

      <p className="sr-only" role="status">{copiedSummary ? 'The summary is on the clipboard, ready to paste.' : ''}</p>
      <ActionBar label="Finish this trip">
        <button
          type="button"
          onClick={handleCopySummary}
          aria-label={copiedSummary ? 'Summary copied' : 'Copy summary for the group chat'}
          className="btn btn-secondary btn-lg min-w-0 flex-1 px-4 sm:flex-none sm:px-[22px]"
        >
          {copiedSummary ? <Check className="text-positive" aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span>
            {copiedSummary ? 'Summary copied' : <>Copy summary<span className="hidden sm:inline"> for the group chat</span></>}
          </span>
        </button>
        <button type="button" onClick={onArchiveTrip} className="btn btn-primary btn-lg min-w-0 flex-1 px-4 sm:flex-none sm:px-[22px]">
          <Archive aria-hidden="true" className="hidden sm:block" />
          <span>Finish and archive</span>
        </button>
      </ActionBar>
    </div>
  );
}
