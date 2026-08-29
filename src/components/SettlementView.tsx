'use client';

import React, { useState } from 'react';
import {
  Send,
  Copy,
  Check,
  Edit3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Receipt,
  Calendar,
  CheckCircle2,
  Sparkles,
  Archive,
} from 'lucide-react';
import { Household, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import confetti from 'canvas-confetti';

interface SettlementViewProps {
  trip: Trip;
  household: Household;
  onEditClaims: () => void;
  onArchiveTrip: () => void;
}

export function SettlementView({
  trip,
  household,
  onEditClaims,
  onArchiveTrip,
}: SettlementViewProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);

  const summary = calculateTripSettlement(trip, household);
  const payer = summary.payer;

  // Calculate total reimbursement collected for the payer
  const totalReimbursement = summary.participants
    .filter((p) => !p.isPayer)
    .reduce((acc, p) => acc + p.netOwed, 0);

  const handleCopySummary = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summary.groupChatSummary);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopiedSummary(true);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch (e) {
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
    <div className="mx-auto max-w-3xl px-4 py-8 pb-20">
      {/* Header Banner */}
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> Trip Settlement Breakdown
        </span>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {summary.storeName || 'Grocery Trip'}
        </h1>
        <div className="mt-1 flex items-center justify-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {summary.date}
          </span>
          <span>•</span>
          <span>
            Total Bill: <strong>${summary.totalBill.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Payer Summary Card */}
      <div className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{payer.avatarEmoji}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-900 dark:text-white">{payer.name}</span>
                <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Paid Receipt
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Venmo: <strong className="text-emerald-700 dark:text-emerald-300">{payer.venmoHandle || 'Not set'}</strong>
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 text-right shadow-xs dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total to Reimburse {payer.name}
            </span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              +${totalReimbursement.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions Row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onEditClaims}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>Edit Claims</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all cursor-pointer"
          >
            {copiedSummary ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Summary for Group Chat</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onArchiveTrip}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Finish & Archive</span>
          </button>
        </div>
      </div>

      {/* Roommate Breakdown Cards */}
      <div className="space-y-4">
        {summary.participants.map((p) => {
          const isExpanded = expandedParticipantId === p.participantId;
          return (
            <div
              key={p.participantId}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
            >
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.participant.avatarEmoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {p.participant.name}
                      </span>
                      {p.isPayer && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Payer (Fronted Bill)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {p.claimedItems.length} personal items + {p.householdSharedItems.length} shared
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {p.isPayer ? 'Own Share' : 'Owes Payer'}
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      ${p.isPayer
                        ? (p.personalSubtotal + p.householdSharedSubtotal + p.taxAttributed - p.basketDiscountShare).toFixed(2)
                        : p.netOwed.toFixed(2)}
                    </span>
                  </div>

                  {!p.isPayer && p.netOwed > 0 && (
                    <a
                      href={p.venmoDeepLink || p.venmoWebLink || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl bg-[#008CFF] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0077DB] active:scale-95 transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Venmo</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleExpand(p.participantId)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="View item breakdown"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Itemized Drawer */}
              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50/80 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="space-y-3.5">
                    {/* Claimed Personal Items */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Claimed Line Items:
                      </span>
                      {p.claimedItems.length === 0 ? (
                        <p className="text-slate-400 dark:text-slate-500 italic text-xs mt-1">No individual items claimed.</p>
                      ) : (
                        <div className="mt-1.5 space-y-1.5">
                          {p.claimedItems.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-slate-800 dark:text-slate-200">
                              <span className="font-medium">
                                • {it.itemName} {it.claimedQuantity > 1 && `(${it.claimedQuantity}x)`}
                                {it.isTaxable && (
                                  <span className="ml-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                                    [Taxed]
                                  </span>
                                )}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">${it.priceShare.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Shared Items */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Share of Household Staples (Auto 4-Way Split):
                      </span>
                      {p.householdSharedItems.length === 0 ? (
                        <p className="text-slate-400 dark:text-slate-500 italic text-xs mt-1">No shared household items.</p>
                      ) : (
                        <div className="mt-1.5 space-y-1.5">
                          {p.householdSharedItems.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                              <span>• {it.itemName} (1/{household.participants.length} share)</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">${it.priceShare.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Financial Subtotals */}
                    <div className="border-t border-slate-200 pt-3 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-400 font-medium">
                      <div className="flex justify-between">
                        <span>Items Subtotal:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          ${(p.personalSubtotal + p.householdSharedSubtotal).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Sales Tax Attribution{' '}
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                            (on ${p.taxableSubtotal.toFixed(2)} taxable goods)
                          </span>
                          :
                        </span>
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          +${p.taxAttributed.toFixed(2)}
                        </span>
                      </div>
                      {p.basketDiscountShare > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                          <span>Basket Discount Share:</span>
                          <span>-${p.basketDiscountShare.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
