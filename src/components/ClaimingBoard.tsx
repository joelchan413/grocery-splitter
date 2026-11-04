'use client';

import React from 'react';
import {
  Users,
  CheckCircle2,
  ArrowRight,
  Edit3,
  Check,
  Plus,
  Minus,
} from 'lucide-react';
import { Household, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import confetti from 'canvas-confetti';
import { Avatar, personStyle } from './Avatar';

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
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 }, disableForReducedMotion: true });
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
  // The payer owes nothing, so their bar shows their own share of the bill instead.
  const activeIsPayer = activeParticipantId === liveSummary.payer.id;
  const activeShare = activeSettlement
    ? activeIsPayer
      ? activeSettlement.ownShare
      : activeSettlement.netOwed
    : 0;

  const numReady = readySet.size;
  const totalRoommates = household.participants.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      {/* Title row: the run being claimed */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {trip.storeName}
          </h1>
          <p className="text-xs text-slate-500">
            {trip.items.length} {trip.items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <span className="text-xs text-slate-500 text-right">
          Unclaimed items are split {household.participants.length} ways
        </span>
      </div>

      {/* Top Participant Switcher Bar */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-slate-200 bg-white px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border desk:top-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 id="claiming-for" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Who&apos;s claiming?</span>
          </h2>
          <button
            type="button"
            onClick={onBackToReview}
            className="flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit receipt items
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-labelledby="claiming-for">
          {household.participants.map((p) => {
            const isSelected = activeParticipantId === p.id;
            const isReady = readySet.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectParticipant(p.id)}
                aria-pressed={isSelected}
                style={personStyle(p)}
                className={`person-tint relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-[var(--tint-ink)] bg-[var(--tint-bg)] text-[var(--tint-ink)] ring-1 ring-[var(--tint-ink)]'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[var(--tint-ink)]'
                }`}
              >
                <Avatar participant={p} className={isSelected ? 'bg-white!' : ''} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className={`truncate text-xs ${isSelected ? '' : 'text-slate-500'}`}>
                    {p.id === liveSummary.payer.id ? 'Paid the bill' : p.venmoHandle || 'Roommate'}
                  </div>
                </div>
                {isReady && (
                  <span
                    className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-900 text-white"
                    title="Done claiming"
                  >
                    <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                    <span className="sr-only">Done claiming</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Readiness Check-in Banner */}
      <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              Done claiming
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 num">
              {numReady} of {totalRoommates}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Claims can still change after balances are worked out.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleToggleReady}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              isSelfReady
                ? 'bg-primary-100 text-primary-800 border border-primary-300'
                : 'bg-primary-600 text-white hover:bg-primary-500'
            }`}
          >
            {isSelfReady ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary-600" aria-hidden="true" />
                <span>{activeParticipant.name} is done</span>
              </>
            ) : (
              <>
                <span>I&apos;m done claiming</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onViewSettlement}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span>View balances</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Line Items List */}
      <div className="space-y-3">
        {trip.items.map((item) => {
          // Claims from people no longer in the household don't count, matching the settlement.
          const itemClaims = Object.fromEntries(
            Object.entries(trip.claims[item.id] || {}).filter(([pId]) => household.participants.some((p) => p.id === pId))
          );
          const selfClaimedQty = itemClaims[activeParticipantId] || 0;
          const totalClaimedQty = Object.values(itemClaims).reduce((a, b) => a + (b || 0), 0);
          const isHouseholdShared = totalClaimedQty === 0;
          const claimants = household.participants.filter(
            (p) => (itemClaims[p.id] || 0) > 0
          );

          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition-colors ${
                selfClaimedQty > 0
                  ? 'border-primary-500/60 bg-primary-50/20'
                  : isHouseholdShared
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                {/* Item Details */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {item.name}
                    </span>
                    {item.isTaxable ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        Taxed
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
                        Not taxed
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
                      <span className="font-semibold text-slate-800">
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
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                        selfClaimedQty > 0
                          ? 'bg-primary-600 text-white hover:bg-primary-500'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                        <span>{totalClaimedQty > 0 ? 'Join split' : 'Claim'}</span>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleSetQuantityClaim(item.id, selfClaimedQty - 1, item.quantity)
                        }
                        disabled={selfClaimedQty === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        title="Decrease"
                        aria-label={`Claim one fewer ${item.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-10 text-center text-xs font-semibold text-slate-900">
                        {selfClaimedQty} / {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleSetQuantityClaim(item.id, selfClaimedQty + 1, item.quantity)
                        }
                        disabled={totalClaimedQty >= item.quantity && selfClaimedQty === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        title="Increase"
                        aria-label={`Claim one more ${item.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Split toggle */}
                  <button
                    type="button"
                    onClick={() => handleSplitWithAll(item.id, item.quantity)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Split equally across all roommates"
                  >
                    Split all
                  </button>
                </div>
              </div>

              {/* Claimed Badges Row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100">
                {isHouseholdShared ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    Shared by everyone, ${((item.quantity * item.unitPrice) / totalRoommates).toFixed(2)} each
                  </span>
                ) : (
                  <>
                    <span className="text-xs font-medium text-slate-500">Claimed by</span>
                    {claimants.map((c) => {
                      const qty = itemClaims[c.id] || 0;
                      const itemGross = item.quantity * item.unitPrice;
                      const shareCost = totalClaimedQty >= item.quantity
                        ? (qty / totalClaimedQty) * itemGross
                        : qty * item.unitPrice;

                      return (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800"
                        >
                          <Avatar participant={c} size="sm" className="-ml-1.5" />
                          <span>{c.name}</span>
                          <span className="text-xs font-normal text-slate-600 num">
                            ${shareCost.toFixed(2)}{totalClaimedQty > 1 && item.quantity === 1 ? ` · 1/${totalClaimedQty}` : ''}
                          </span>
                        </span>
                      );
                    })}

                    {totalClaimedQty < item.quantity && (
                      <span className="text-xs font-medium text-amber-800">
                        {item.quantity - totalClaimedQty} still shared
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleResetItemClaims(item.id)}
                      className="ml-auto rounded-md text-xs text-slate-600 hover:text-red-700 cursor-pointer"
                    >
                      Reset to shared
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Bar with Live Balance */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white p-3 desk:left-[var(--sidebar-width)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <Avatar participant={activeParticipant} size="lg" />
            <div>
              <div className="text-xs text-slate-600">
                {activeIsPayer ? `${activeParticipant.name}'s own share` : `${activeParticipant.name} owes so far`}
              </div>
              <div className="text-base font-semibold text-slate-900 num">
                ${activeShare.toFixed(2)}{' '}
                {activeIsPayer && (
                  <span className="text-xs text-slate-500 font-normal">paid the bill</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onViewSettlement}
            className="flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-500 active:scale-95 transition-[background-color,transform] cursor-pointer"
          >
            <span>View breakdown</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
