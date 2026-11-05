'use client';

import React from 'react';
import { CheckCircle2, ArrowRight, Check, Plus, Minus } from 'lucide-react';
import { Household, Trip } from '@/types';
import { calculateTripSettlement } from '@/lib/calculations';
import confetti from 'canvas-confetti';
import { Avatar, personStyle } from './Avatar';
import { ActionBar, TripSteps } from './TripLayout';

interface ClaimingBoardProps {
  trip: Trip;
  household: Household;
  activeParticipantId: string;
  onSelectParticipant: (id: string) => void;
  onUpdateTrip: (updated: Trip) => void;
  onViewSettlement: () => void;
  onBackToReview: () => void;
  /** Saved receipt photos, shown under the title. */
  photos?: React.ReactNode;
}

export function ClaimingBoard({
  trip,
  household,
  activeParticipantId,
  onSelectParticipant,
  onUpdateTrip,
  onViewSettlement,
  onBackToReview,
  photos,
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
  // One polite announcement for the steppers, in place of a live region on every row.
  const [announcement, setAnnouncement] = React.useState('');

  const handleSetQuantityClaim = (itemId: string, newQty: number, maxQty: number, itemName = '') => {
    const currentClaims = { ...(trip.claims[itemId] || {}) };
    const clampedQty = Math.max(0, Math.min(maxQty, newQty));
    setAnnouncement(`${activeParticipant.name}: ${clampedQty} of ${maxQty} ${itemName}`);

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
  const liveSummary = React.useMemo(() => calculateTripSettlement(trip, household), [trip, household]);
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

  const splitWays = household.participants.length;

  return (
    <div className="screen has-bar">
      <TripSteps current="claiming" onOpen={{ review: onBackToReview, settlement: onViewSettlement }} />
      <div className="mb-5">
        <h1 className="screen-title">{trip.storeName}</h1>
        <p className="screen-lede">
          {trip.items.length} {trip.items.length === 1 ? 'item' : 'items'} · anything nobody claims is split {splitWays} ways
        </p>
      </div>
      {photos}

      {/* Who is claiming: stays in reach while the list scrolls. */}
      <section
        aria-labelledby="claiming-for"
        className="sticky top-16 z-20 -mx-4 mb-4 border-b border-slate-200 bg-[var(--ground)] px-4 pt-2 pb-3 sm:mx-0 sm:px-0 sm:border-b-0 desk:top-0 desk:pt-4"
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="claiming-for" className="text-[15px] font-medium text-slate-900">Who&apos;s claiming?</h2>
          <span className="text-sm text-slate-500 num">{numReady} of {totalRoommates} done</span>
        </div>
        <div className="claim-people" role="group" aria-labelledby="claiming-for">
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
                className="claim-person person-tint"
              >
                <Avatar participant={p} size="sm" className="sm:hidden" />
                <Avatar participant={p} className="hidden sm:inline-grid" />
                <span className="min-w-0 max-w-full">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className={`hidden truncate text-[13px] sm:block ${isSelected ? '' : 'text-slate-500'}`}>
                    {p.id === liveSummary.payer.id ? 'Paid the bill' : p.venmoHandle || 'Roommate'}
                  </span>
                </span>
                {isReady && (
                  <span className="claim-person-done" title="Done claiming">
                    <Check aria-hidden="true" />
                    <span className="sr-only">Done claiming</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <p className="sr-only" role="status">{announcement}</p>

      {/* One row per item. Rows the chosen roommate claimed take their colour. */}
      <h2 className="sr-only">Items</h2>
      <ul className="claim-list card overflow-hidden" style={personStyle(activeParticipant)}>
        {trip.items.map((item) => {
          // Claims from people no longer in the household don't count, matching the settlement.
          const itemClaims = Object.fromEntries(
            Object.entries(trip.claims[item.id] || {}).filter(([pId]) => household.participants.some((p) => p.id === pId))
          );
          const selfClaimedQty = itemClaims[activeParticipantId] || 0;
          const totalClaimedQty = Object.values(itemClaims).reduce((a, b) => a + (b || 0), 0);
          const isHouseholdShared = totalClaimedQty === 0;
          const claimants = household.participants.filter((p) => (itemClaims[p.id] || 0) > 0);
          const itemGross = item.quantity * item.unitPrice;
          const mine = selfClaimedQty > 0;

          return (
            <li key={item.id} className={`claim-row person-tint${mine ? ' is-mine' : ''}`}>
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-snug text-slate-900">
                  {item.name}
                  {item.isTaxable && <> <span className="tag-taxed">Taxed</span></>}
                </p>
                <p className="mt-0.5 text-sm text-slate-500 num">
                  {item.quantity > 1 ? (
                    <>
                      {item.quantity} × ${item.unitPrice.toFixed(2)} = <span className="font-medium text-slate-900">${itemGross.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="font-medium text-slate-900">${item.unitPrice.toFixed(2)}</span>
                  )}
                </p>
              </div>

              {/* Claiming controls for the chosen roommate */}
              <div className="flex items-center gap-1.5">
                {item.quantity === 1 ? (
                  <button
                    type="button"
                    onClick={() => handleToggleSingleClaim(item.id)}
                    aria-pressed={mine}
                    // Every row has these buttons, so each name starts with its visible label, then says which item.
                    aria-label={`${mine ? (totalClaimedQty > 1 ? `Split (1/${totalClaimedQty})` : 'Mine') : totalClaimedQty > 0 ? 'Join split' : 'Claim'}: ${item.name}`}
                    className={`btn btn-sm min-w-[5.5rem] ${mine ? 'btn-claimed' : 'btn-secondary'}`}
                  >
                    {mine ? (
                      <>
                        <Check aria-hidden="true" className="stroke-[3]" />
                        <span>{totalClaimedQty > 1 ? `Split (1/${totalClaimedQty})` : 'Mine'}</span>
                      </>
                    ) : (
                      <span>{totalClaimedQty > 0 ? 'Join split' : 'Claim'}</span>
                    )}

                  </button>
                ) : (
                  <div className={`claim-stepper${mine ? ' is-mine' : ''}`}>
                    <button
                      type="button"
                      onClick={() => handleSetQuantityClaim(item.id, selfClaimedQty - 1, item.quantity, item.name)}
                      disabled={selfClaimedQty === 0}
                      title="Claim one fewer"
                      aria-label={`Claim one fewer ${item.name}`}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <span className="claim-stepper-count num">
                      {selfClaimedQty} / {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSetQuantityClaim(item.id, selfClaimedQty + 1, item.quantity, item.name)}
                      disabled={selfClaimedQty >= item.quantity || (totalClaimedQty >= item.quantity && selfClaimedQty === 0)}
                      title="Claim one more"
                      aria-label={`Claim one more ${item.name}`}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                )}

              </div>

              {/* Who has it */}
              <div className="claim-row-status">
                {isHouseholdShared ? (
                  <span className="mr-auto num">Shared by everyone · ${(itemGross / totalRoommates).toFixed(2)} each</span>
                ) : (
                  <>
                    {claimants.map((c) => {
                      const qty = itemClaims[c.id] || 0;
                      const shareCost = totalClaimedQty >= item.quantity
                        ? (qty / totalClaimedQty) * itemGross
                        : qty * item.unitPrice;
                      return (
                        <span key={c.id} className="claim-chip person-tint" style={personStyle(c)}>
                          <Avatar participant={c} size="sm" />
                          <span>{c.name}</span>
                          <span className="font-normal num">
                            ${shareCost.toFixed(2)}{totalClaimedQty > 1 && item.quantity === 1 ? ` · 1/${totalClaimedQty}` : ''}
                          </span>
                        </span>
                      );
                    })}

                    {totalClaimedQty < item.quantity && (
                      <span className="text-[13px] font-medium text-amber-800">
                        {item.quantity - totalClaimedQty} still shared
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleResetItemClaims(item.id)}
                      // Sits before Split all, so the two row actions line up at the end of every row.
                      aria-label={`Reset to shared: ${item.name}`}
                      className="btn btn-quiet btn-sm ml-auto text-[13px]!"
                    >
                      Reset to shared
                    </button>
                  </>
                )}
                {/* Unclaimed items are already split by everyone, so Split all only shows once someone has claimed. */}
                {!isHouseholdShared && claimants.length < household.participants.length && (
                  <button
                    type="button"
                    onClick={() => handleSplitWithAll(item.id, item.quantity)}
                    className="btn btn-quiet btn-sm -mr-2 text-[13px]!"
                    title="Split equally across all roommates"
                    aria-label={`Split all: ${item.name}`}
                  >
                    Split all
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Saying you're done comes after the list, where claiming ends. */}
      <section aria-labelledby="done-heading" className="card mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="done-heading" className="text-base font-medium text-slate-900">Done claiming</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {numReady} of {totalRoommates} roommates are done. Claims can still change after balances are worked out.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggleReady}
          aria-pressed={isSelfReady}
          className={`btn btn-lg ${isSelfReady ? 'btn-paid' : 'btn-secondary'}`}
        >
          {isSelfReady ? (
            <>
              <CheckCircle2 aria-hidden="true" />
              <span>{activeParticipant.name} is done</span>
            </>
          ) : (
            <span>I&apos;m done claiming</span>
          )}
        </button>
      </section>

      <ActionBar label="Your share">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar participant={activeParticipant} size="lg" className="hidden sm:inline-grid" />
          <div className="min-w-0">
            <p className="action-bar-label truncate">
              {activeIsPayer ? `${activeParticipant.name}'s own share` : `${activeParticipant.name} owes so far`}
            </p>
            <p className="action-bar-value num">
              ${activeShare.toFixed(2)}{' '}
              {activeIsPayer && <span className="hidden text-[13px] font-normal text-slate-500 sm:inline">paid the bill</span>}
            </p>
          </div>
        </div>

        <button type="button" onClick={onViewSettlement} className="btn btn-primary btn-lg">
          <span>View balances</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </ActionBar>
    </div>
  );
}
