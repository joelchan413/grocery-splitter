import { Household, Participant, Trip, TripSettlementSummary, ParticipantSettlement } from '@/types';

/**
 * Rounds a number to 2 decimal places cleanly
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates complete itemized settlement breakdown for a trip adhering to ADR 0001:
 * - Proportional Tax Attribution: only claimants of taxable items pay tax
 * - Household Shared Items: all unassigned quantities auto-split equally among all household members
 * - Basket Discounts: distributed proportionally to participants' subtotals
 * - Venmo deep link generation
 */
export function calculateTripSettlement(
  trip: Trip,
  household: Household
): TripSettlementSummary {
  const payer = household.participants.find((p) => p.id === trip.payerId) || household.participants[0] || {
    id: trip.payerId || 'unknown',
    name: 'Unknown Roommate',
    avatarEmoji: '🛒',
    color: '#2563EB',
    venmoHandle: '',
  };
  const numParticipants = household.participants.length || 1;
  const items = Array.isArray(trip.items) ? trip.items : [];
  const claims = trip.claims || {};
  const taxTotal = typeof trip.taxTotal === 'number' && !Number.isNaN(trip.taxTotal) ? trip.taxTotal : 0;
  const basketDiscount = typeof trip.basketDiscount === 'number' && !Number.isNaN(trip.basketDiscount) ? trip.basketDiscount : 0;

  // Initialize tracking containers for each participant
  interface AccParticipant {
    participant: Participant;
    isPayer: boolean;
    personalSubtotal: number;
    householdSharedSubtotal: number;
    lineDiscountsTotal: number;
    taxableSubtotal: number;
    claimedItems: ParticipantSettlement['claimedItems'];
    householdSharedItems: ParticipantSettlement['householdSharedItems'];
  }

  const accMap = new Map<string, AccParticipant>();
  for (const p of household.participants) {
    accMap.set(p.id, {
      participant: p,
      isPayer: p.id === payer.id,
      personalSubtotal: 0,
      householdSharedSubtotal: 0,
      lineDiscountsTotal: 0,
      taxableSubtotal: 0,
      claimedItems: [],
      householdSharedItems: [],
    });
  }

  let totalItemsGross = 0;
  let totalLineDiscounts = 0;
  let totalTaxableGross = 0;

  // 1. Process each Line Item and allocate claims & unclaimed portions
  for (const item of items) {
    const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
    const lineDiscount = item.lineDiscount || 0;
    const itemNet = Math.max(0, itemTotal - lineDiscount);

    totalItemsGross += itemTotal;
    totalLineDiscounts += lineDiscount;
    if (item.isTaxable) {
      totalTaxableGross += itemNet;
    }

    // Claims from people no longer in the household count as unclaimed, so their items are split like any other.
    const itemClaims = Object.fromEntries(
      Object.entries(claims[item.id] || {}).filter(([pId]) => accMap.has(pId))
    );
    let totalClaimedQty = 0;
    for (const qty of Object.values(itemClaims)) {
      if (qty > 0) totalClaimedQty += qty;
    }

    // Allocate claimed quantities
    if (totalClaimedQty > 0) {
      const isOverOrFullyClaimed = totalClaimedQty >= item.quantity;
      const effectiveClaimedUnits = Math.min(item.quantity, totalClaimedQty);
      const claimedGrossTotal = isOverOrFullyClaimed ? itemTotal : effectiveClaimedUnits * item.unitPrice;
      const claimedDiscountTotal = isOverOrFullyClaimed ? lineDiscount : (effectiveClaimedUnits / item.quantity) * lineDiscount;

      for (const [pId, qty] of Object.entries(itemClaims)) {
        if (qty <= 0) continue;
        const acc = accMap.get(pId);
        if (!acc) continue;

        const claimantFraction = qty / totalClaimedQty;
        const priceShareGross = claimantFraction * claimedGrossTotal;
        const discountShare = claimantFraction * claimedDiscountTotal;
        const netShare = Math.max(0, priceShareGross - discountShare);

        acc.personalSubtotal += netShare;
        acc.lineDiscountsTotal += discountShare;

        if (item.isTaxable) {
          acc.taxableSubtotal += netShare;
        }

        const isShared = totalClaimedQty > qty || Object.keys(itemClaims).filter(k => (itemClaims[k] || 0) > 0).length > 1;

        acc.claimedItems.push({
          itemId: item.id,
          itemName: item.name,
          claimedQuantity: qty,
          totalQuantity: item.quantity,
          priceShare: round2(netShare),
          isTaxable: item.isTaxable,
          isShared,
        });
      }
    }

    // Allocate unclaimed leftover quantity as Household Shared Item (split evenly across all household members)
    const unallocatedQty = Math.max(0, item.quantity - totalClaimedQty);
    if (unallocatedQty > 0) {
      const unclaimedGross = unallocatedQty * item.unitPrice;
      const unclaimedDiscount = (unallocatedQty / item.quantity) * lineDiscount;
      const unclaimedNet = Math.max(0, unclaimedGross - unclaimedDiscount);
      const perParticipantShare = unclaimedNet / numParticipants;

      for (const acc of accMap.values()) {
        acc.householdSharedSubtotal += perParticipantShare;
        if (item.isTaxable) {
          acc.taxableSubtotal += perParticipantShare;
        }
        acc.householdSharedItems.push({
          itemId: item.id,
          itemName: item.name,
          unallocatedQuantity: unallocatedQty,
          priceShare: round2(perParticipantShare),
          isTaxable: item.isTaxable,
        });
      }
    }
  }

  const itemsSubtotalNet = Math.max(0, totalItemsGross - totalLineDiscounts);
  const effectiveTaxRate = totalTaxableGross > 0 ? taxTotal / totalTaxableGross : 0;

  // 2. Compute individual taxes, basket discounts and net owed
  const participantSettlements: ParticipantSettlement[] = [];
  const exactShares = new Map<string, number>();

  for (const acc of accMap.values()) {
    const participantSubtotal = acc.personalSubtotal + acc.householdSharedSubtotal;
    
    // Proportional Basket Discount
    const basketDiscountShare =
      itemsSubtotalNet > 0 ? (participantSubtotal / itemsSubtotalNet) * basketDiscount : 0;

    // Proportional Tax Attribution (ADR 0001)
    const taxAttributed = acc.taxableSubtotal * effectiveTaxRate;

    const totalCalculated = Math.max(
      0,
      participantSubtotal + taxAttributed - basketDiscountShare
    );

    const ownShare = round2(totalCalculated);
    const netOwed = acc.isPayer ? 0 : ownShare;
    exactShares.set(acc.participant.id, totalCalculated);

    participantSettlements.push({
      participantId: acc.participant.id,
      participant: acc.participant,
      isPayer: acc.isPayer,
      personalSubtotal: round2(acc.personalSubtotal),
      householdSharedSubtotal: round2(acc.householdSharedSubtotal),
      lineDiscountsTotal: round2(acc.lineDiscountsTotal),
      basketDiscountShare: round2(basketDiscountShare),
      taxableSubtotal: round2(acc.taxableSubtotal),
      taxAttributed: round2(taxAttributed),
      itemsShare: round2(participantSubtotal),
      ownShare,
      netOwed,
      claimedItems: acc.claimedItems,
      householdSharedItems: acc.householdSharedItems,
      venmoDeepLink: '',
      venmoWebLink: '',
    });
  }

  // A basket discount larger than the receipt can't make the bill negative.
  const totalBill = Math.max(0, round2(itemsSubtotalNet + taxTotal - basketDiscount));

  // Payments to the payer never add up to more than the bill. Rounding can overshoot by up to a cent per roommate,
  // and a basket discount larger than the payer's own items can overshoot by more. Either way the roommates whose
  // amounts rounded up the most pay a cent less, in turn, until the payments match the bill.
  const roommates = participantSettlements.filter((s) => !s.isPayer && s.netOwed > 0);
  let excessCents =
    Math.round(roommates.reduce((sum, s) => sum + s.netOwed, 0) * 100) - Math.round(totalBill * 100);
  if (excessCents > 0) {
    const roundedUp = (s: ParticipantSettlement) => s.netOwed - (exactShares.get(s.participantId) ?? s.netOwed);
    const order = [...roommates].sort((a, b) => roundedUp(b) - roundedUp(a));
    let reduced = true;
    while (excessCents > 0 && reduced) {
      reduced = false;
      for (const s of order) {
        if (excessCents <= 0) break;
        if (s.netOwed < 0.01) continue;
        s.netOwed = round2(s.netOwed - 0.01);
        s.ownShare = s.netOwed;
        excessCents--;
        reduced = true;
      }
    }
  }

  // The payer keeps whatever the roommates' rounded payments leave of the bill, so the shares add up to it.
  const owedToPayer = participantSettlements.reduce((sum, s) => sum + s.netOwed, 0);
  const payerSettlement = participantSettlements.find((s) => s.isPayer);
  if (payerSettlement) payerSettlement.ownShare = Math.max(0, round2(totalBill - owedToPayer));

  // Venmo deep links, built from the final amounts
  const cleanPayerVenmo = (payer.venmoHandle || '').replace(/^@/, '').trim();
  const tripNote = `Groceries at ${trip.storeName || 'Store'} (${trip.date || 'Today'})`;
  if (cleanPayerVenmo) {
    for (const s of participantSettlements) {
      const formattedAmount = s.netOwed.toFixed(2);
      s.venmoDeepLink = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(cleanPayerVenmo)}&amount=${formattedAmount}&note=${encodeURIComponent(tripNote)}`;
      s.venmoWebLink = `https://account.venmo.com/pay?recipients=${encodeURIComponent(cleanPayerVenmo)}&amount=${formattedAmount}&note=${encodeURIComponent(tripNote)}`;
    }
  }

  // 3. Generate clean group chat summary for iMessage / WhatsApp
  const summaryLines: string[] = [
    `🛒 Grocery Split: ${trip.storeName || 'Groceries'} (${trip.date || 'Recent'})`,
    `💳 Paid by: ${payer.name} ($${totalBill.toFixed(2)} total)`,
    `────────────────────`,
  ];

  for (const s of participantSettlements) {
    if (s.isPayer) {
      summaryLines.push(`• ${s.participant.avatarEmoji} ${s.participant.name} (Payer): $${s.ownShare.toFixed(2)} self-share`);
    } else {
      summaryLines.push(`• ${s.participant.avatarEmoji} ${s.participant.name}: owes $${s.netOwed.toFixed(2)} ➡️ ${s.participant.venmoHandle || 'Venmo'}`);
    }
  }

  summaryLines.push(`────────────────────`);
  if (payer.venmoHandle) summaryLines.push(`⚡ Pay ${payer.name} via Venmo: ${payer.venmoHandle}`);

  return {
    tripId: trip.id,
    storeName: trip.storeName,
    date: trip.date,
    payer,
    totalBill,
    itemsSubtotal: round2(itemsSubtotalNet),
    taxTotal: round2(taxTotal),
    basketDiscount: round2(basketDiscount),
    participants: participantSettlements,
    groupChatSummary: summaryLines.join('\n'),
  };
}
