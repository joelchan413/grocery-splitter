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
  const payer = household.participants.find((p) => p.id === trip.payerId) || household.participants[0];
  const numParticipants = household.participants.length || 1;

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
      isPayer: p.id === trip.payerId,
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
  for (const item of trip.items) {
    const itemTotal = item.quantity * item.unitPrice;
    const lineDiscount = item.lineDiscount || 0;
    const itemNet = Math.max(0, itemTotal - lineDiscount);

    totalItemsGross += itemTotal;
    totalLineDiscounts += lineDiscount;
    if (item.isTaxable) {
      totalTaxableGross += itemNet;
    }

    const itemClaims = trip.claims[item.id] || {};
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
  const effectiveTaxRate = totalTaxableGross > 0 ? trip.taxTotal / totalTaxableGross : 0;

  // 2. Compute individual taxes, basket discounts, net owed, and Venmo deep links
  const participantSettlements: ParticipantSettlement[] = [];

  for (const acc of accMap.values()) {
    const participantSubtotal = acc.personalSubtotal + acc.householdSharedSubtotal;
    
    // Proportional Basket Discount
    const basketDiscountShare =
      itemsSubtotalNet > 0 ? (participantSubtotal / itemsSubtotalNet) * trip.basketDiscount : 0;

    // Proportional Tax Attribution (ADR 0001)
    const taxAttributed = acc.taxableSubtotal * effectiveTaxRate;

    const totalCalculated = Math.max(
      0,
      participantSubtotal + taxAttributed - basketDiscountShare
    );

    const netOwed = acc.isPayer ? 0 : round2(totalCalculated);

    const cleanPayerVenmo = payer.venmoHandle.replace(/^@/, '').trim();
    const formattedAmount = netOwed.toFixed(2);
    const tripNote = `Groceries at ${trip.storeName || 'Store'} (${trip.date || 'Today'})`;
    
    const venmoDeepLink = cleanPayerVenmo
      ? `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(cleanPayerVenmo)}&amount=${formattedAmount}&note=${encodeURIComponent(tripNote)}`
      : '';

    const venmoWebLink = cleanPayerVenmo
      ? `https://account.venmo.com/pay?recipients=${encodeURIComponent(cleanPayerVenmo)}&amount=${formattedAmount}&note=${encodeURIComponent(tripNote)}`
      : '';

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
      netOwed,
      claimedItems: acc.claimedItems,
      householdSharedItems: acc.householdSharedItems,
      venmoDeepLink,
      venmoWebLink,
    });
  }

  // 3. Generate clean group chat summary for iMessage / WhatsApp
  const totalBill = round2(itemsSubtotalNet + trip.taxTotal - trip.basketDiscount);
  const summaryLines: string[] = [
    `🛒 Grocery Split: ${trip.storeName || 'Groceries'} (${trip.date || 'Recent'})`,
    `💳 Paid by: ${payer.name} ($${totalBill.toFixed(2)} total)`,
    `────────────────────`,
  ];

  for (const s of participantSettlements) {
    if (s.isPayer) {
      const ownShare = round2(s.personalSubtotal + s.householdSharedSubtotal + s.taxAttributed - s.basketDiscountShare);
      summaryLines.push(`• ${s.participant.avatarEmoji} ${s.participant.name} (Payer): $${ownShare.toFixed(2)} self-share`);
    } else {
      summaryLines.push(`• ${s.participant.avatarEmoji} ${s.participant.name}: owes $${s.netOwed.toFixed(2)} ➡️ ${s.participant.venmoHandle || 'Venmo'}`);
    }
  }

  summaryLines.push(`────────────────────`);
  summaryLines.push(`⚡ Pay ${payer.name} via Venmo: ${payer.venmoHandle}`);

  return {
    tripId: trip.id,
    storeName: trip.storeName,
    date: trip.date,
    payer,
    totalBill,
    itemsSubtotal: round2(itemsSubtotalNet),
    taxTotal: round2(trip.taxTotal),
    basketDiscount: round2(trip.basketDiscount),
    participants: participantSettlements,
    groupChatSummary: summaryLines.join('\n'),
  };
}
