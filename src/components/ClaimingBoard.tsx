'use client';

import React, { useState } from 'react';
import {
  Users,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Edit3,
  Check,
  Plus,
  Minus,
  ArrowLeft,
  Share2,
} from 'lucide-react';
import { Household, Participant, Trip, LineItem } from '@/types';
import { calculateTripSettlement, round2 } from '@/lib/calculations';
import confetti from 'canvas-confetti';

interface ClaimingBoardProps {
  trip: Trip;
  household: Household;
  activeParticipantId: string;
  onSelectParticipant: (id: string) => void;
  onUpdateTrip: (updated: Trip) => void;
  onViewSettlement: () => void;
  onBackToReview: () => void;
}

export function ClaimingBoard({
  trip,
  household,
  activeParticipantId,
  onSelectParticipant,
  onUpdateTrip,
  onViewSettlement,
  onBackToReview,
}: ClaimingBoardProps) {
  const activeParticipant =
    household.participants.find((p) => p.id === activeParticipantId) ||
    household.participants[0];

  const readySet = new Set(trip.readyParticipantIds || []);
  const isSelfReady = readySet.has(activeParticipantId);

  // Toggle ready status for the active participant
  const handleToggleReady = () => {
    const nextReady = new Set(readySet);
    if (nextReady.has(activeParticipantId)) {
      nextReady.delete(activeParticipantId);
    } else {
      nextReady.add(activeParticipantId);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
    }

    const updatedTrip: Trip = {
      ...trip,
      readyParticipantIds: Array.from(nextReady),
    };
    onUpdateTrip(updatedTrip);
  };

  // Adjust claimed quantity for active participant on an item
  const handleSetQuantityClaim = (itemId: string, newQty: number, maxQty: number) => {
    const currentClaims = { ...(trip.claims[itemId] || {}) };
    const clampedQty = Math.max(0, Math.min(maxQty, newQty));

    if (clampedQty === 0) {
      delete currentClaims[activeParticipantId];
    } else {
      currentClaims[activeParticipantId] = clampedQty;
    }

    const updatedClaims = {
      ...trip.claims,
      [itemId]: currentClaims,
    };

    onUpdateTrip({
      ...trip,
      claims: updatedClaims,
    });
  };

  // 1-tap Toggle for single quantity item
  const handleToggleSingleClaim = (itemId: string) => {
    const currentClaims = { ...(trip.claims[itemId] || {}) };
    const isClaimed = (currentClaims[activeParticipantId] || 0) > 0;

    if (isClaimed) {
      delete currentClaims[activeParticipantId];
    } else {
      currentClaims[activeParticipantId] = 1;
    }

    onUpdateTrip({
      ...trip,
      claims: {
        ...trip.claims,
        [itemId]: currentClaims,
      },
    });
  };

  // 1-tap Split evenly across all roommates
  const handleSplitWithAll = (itemId: string, quantity: number) => {
    const currentClaims: Record<string, number> = {};
    for (const p of household.participants) {
      currentClaims[p.id] = quantity; // equal weight
    }

    onUpdateTrip({
      ...trip,
      claims: {
        ...trip.claims,
        [itemId]: currentClaims,
      },
    });
  };

  // Clear claims on an item (reverts to household shared default)
  const handleResetItemClaims = (itemId: string) => {
    const nextClaims = { ...trip.claims };
    delete nextClaims[itemId];
    onUpdateTrip({
      ...trip,
      claims: nextClaims,
    });
  };

  // Live estimate calculation for active participant
  const liveSummary = calculateTripSettlement(trip, household);
  const activeSettlement = liveSummary.participants.find(
    (p) => p.participantId === activeParticipantId
  );

  const numReady = readySet.size;
  const totalRoommates = household.participants.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      {/* Top Participant Switcher Bar */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Users className="h-3.5 w-3.5" />
            <span>Select Who is Claiming:</span>
          </div>
          <button
            onClick={onBackToReview}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <Edit3 className="h-3 w-3" /> Edit Receipt Items
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {household.participants.map((p) => {
            const isSelected = activeParticipantId === p.id;
            const isReady = readySet.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectParticipant(p.id)}
                className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50 text-slate-900 shadow-sm ring-2 ring-emerald-500/20 dark:bg-emerald-950/50 dark:text-white'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
                }`}
              >
                <span className="text-xl">{p.avatarEmoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">{p.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {p.id === trip.payerId ? '👑 Payer' : p.venmoHandle || 'Roommate'}
                  </div>
                </div>
                {isReady && (
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs"
                    title="Ready!"
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Readiness Check-in Banner */}
      <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Roommate Progress:
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {numReady} of {totalRoommates} Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Claims can still be adjusted at any time even after calculation.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleToggleReady}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              isSelfReady
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500'
            }`}
          >
            {isSelfReady ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>{activeParticipant.name}: Ready ✓</span>
              </>
            ) : (
              <>
                <span>I&apos;m Done Claiming</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onViewSettlement}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all cursor-pointer"
          >
            <span>View Balances</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Items Section Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Receipt Items ({trip.items.length})
        </h2>
        <span className="text-xs text-slate-400">
          Unclaimed items auto-split 4 ways as household shared
        </span>
      </div>

      {/* Line Items List */}
      <div className="space-y-3">
        {trip.items.map((item) => {
          const itemClaims = trip.claims[item.id] || {};
          const selfClaimedQty = itemClaims[activeParticipantId] || 0;
          const totalClaimedQty = Object.values(itemClaims).reduce((a, b) => a + (b || 0), 0);
          const isHouseholdShared = totalClaimedQty === 0;
          const claimants = household.participants.filter(
            (p) => (itemClaims[p.id] || 0) > 0
          );

          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition-all ${
                selfClaimedQty > 0
                  ? 'border-emerald-500/60 bg-emerald-50/20 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/10'
                  : isHouseholdShared
                  ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/20'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                {/* Item Details */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.name}
                    </span>
                    {item.isTaxable ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        🏷️ Taxed
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        🌱 Exempt
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.quantity > 1 ? (
                      <span>
                        {item.quantity} units @ ${item.unitPrice.toFixed(2)} each ={' '}
                        <strong>${(item.quantity * item.unitPrice).toFixed(2)}</strong>
                      </span>
                    ) : (
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        ${item.unitPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Claiming Actions for Active Participant */}
                <div className="flex items-center gap-2">
                  {item.quantity === 1 ? (
                    <button
                      type="button"
                      onClick={() => handleToggleSingleClaim(item.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                        selfClaimedQty > 0
                          ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {selfClaimedQty > 0 ? (
                        <>
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>
                            {totalClaimedQty > 1 ? `Split (1/${totalClaimedQty})` : 'Mine'}
                          </span>
                        </>
                      ) : (
                        <span>{totalClaimedQty > 0 ? 'Join Split' : 'Claim'}</span>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          handleSetQuantityClaim(item.id, selfClaimedQty - 1, item.quantity)
                        }
                        disabled={selfClaimedQty === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Decrease"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-10 text-center text-xs font-bold text-slate-900 dark:text-white">
                        {selfClaimedQty} / {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleSetQuantityClaim(item.id, selfClaimedQty + 1, item.quantity)
                        }
                        disabled={totalClaimedQty >= item.quantity && selfClaimedQty === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Increase"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Split toggle */}
                  <button
                    type="button"
                    onClick={() => handleSplitWithAll(item.id, item.quantity)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                    title="Split equally across all roommates"
                  >
                    Split All
                  </button>
                </div>
              </div>

              {/* Claimed Badges Row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                {isHouseholdShared ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    🏡 Shared by Household (1/{totalRoommates} each: ${( (item.quantity * item.unitPrice) / totalRoommates ).toFixed(2)})
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] font-bold text-slate-400">Claimed by:</span>
                    {claimants.map((c) => {
                      const qty = itemClaims[c.id] || 0;
                      const itemGross = item.quantity * item.unitPrice;
                      const shareCost = totalClaimedQty >= item.quantity
                        ? (qty / totalClaimedQty) * itemGross
                        : qty * item.unitPrice;

                      return (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <span>{c.avatarEmoji}</span>
                          <span>{c.name}</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            (${shareCost.toFixed(2)}{totalClaimedQty > 1 && item.quantity === 1 ? ` · 1/${totalClaimedQty}` : ''})
                          </span>
                        </span>
                      );
                    })}

                    {totalClaimedQty < item.quantity && (
                      <span className="text-[10px] text-amber-600 font-semibold dark:text-amber-400">
                        ({item.quantity - totalClaimedQty} remaining shared)
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleResetItemClaims(item.id)}
                      className="ml-auto text-[10px] text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      Reset to Shared
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Bar with Live Balance */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{activeParticipant.avatarEmoji}</span>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {activeParticipant.name}&apos;s Estimated Share:
              </div>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                ${activeSettlement?.netOwed.toFixed(2) || '0.00'}{' '}
                {activeParticipantId === trip.payerId && (
                  <span className="text-[10px] text-slate-400 font-normal">(Payer)</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onViewSettlement}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
          >
            <span>View Final Breakdown</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
