export interface Participant {
  id: string;
  name: string;
  avatarEmoji: string;
  color: string; // Tailwind color class or hex (e.g., '#3B82F6')
  venmoHandle: string;
}

export interface Household {
  id: string;
  name: string;
  participants: Participant[];
}

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isTaxable: boolean;
  lineDiscount?: number;
}

/**
 * Maps participantId -> quantity claimed (number)
 * e.g., { "p1": 2, "p2": 1 } for a line item with quantity 3
 */
export type ItemClaims = Record<string, number>;

export interface Trip {
  id: string;
  householdId: string;
  storeName: string;
  date: string;
  payerId: string;
  items: LineItem[];
  taxTotal: number;
  basketDiscount: number;
  receiptImages: string[];
  claims: Record<string, ItemClaims>; // lineItemId -> ItemClaims
  readyParticipantIds: string[];
  status: 'review' | 'claiming' | 'settled';
  createdAt: string;
}

export interface ParticipantSettlement {
  participantId: string;
  participant: Participant;
  isPayer: boolean;
  personalSubtotal: number;
  householdSharedSubtotal: number;
  lineDiscountsTotal: number;
  basketDiscountShare: number;
  taxableSubtotal: number;
  taxAttributed: number;
  netOwed: number; // Amount owed to payer (0 for payer itself)
  claimedItems: {
    itemId: string;
    itemName: string;
    claimedQuantity: number;
    totalQuantity: number;
    priceShare: number;
    isTaxable: boolean;
    isShared: boolean;
  }[];
  householdSharedItems: {
    itemId: string;
    itemName: string;
    unallocatedQuantity: number;
    priceShare: number;
    isTaxable: boolean;
  }[];
  venmoDeepLink: string;
  venmoWebLink: string;
}

export interface TripSettlementSummary {
  tripId: string;
  storeName: string;
  date: string;
  payer: Participant;
  totalBill: number;
  itemsSubtotal: number;
  taxTotal: number;
  basketDiscount: number;
  participants: ParticipantSettlement[];
  groupChatSummary: string;
}
