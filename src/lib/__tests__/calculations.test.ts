import { calculateTripSettlement, round2 } from '../calculations';
import { Household, Trip } from '../../types';

// Mock Household with 4 roommates
const mockHousehold: Household = {
  id: 'h1',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#3B82F6', venmoHandle: '@joel-doe' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#10B981', venmoHandle: '@alex-smith' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#F59E0B', venmoHandle: '@sam-jones' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#8B5CF6', venmoHandle: '@jordan-lee' },
  ],
};

function runSanityCheck() {
  console.log('--- Test 1: Mixed Claims, Tax Attribution, and Household Unclaimed ---');

  const mockTrip1: Trip = {
    id: 't1',
    householdId: 'h1',
    storeName: "Trader Joe's",
    date: '2026-08-29',
    payerId: 'p1', // Joel paid
    items: [
      { id: 'i1', name: 'Organic Whole Milk', quantity: 1, unitPrice: 4.00, totalPrice: 4.00, isTaxable: false },
      { id: 'i2', name: 'Hard Cider 6pk', quantity: 1, unitPrice: 10.00, totalPrice: 10.00, isTaxable: true },
      { id: 'i3', name: 'Bananas', quantity: 4, unitPrice: 0.50, totalPrice: 2.00, isTaxable: false },
      { id: 'i4', name: 'Paper Towels', quantity: 1, unitPrice: 8.00, totalPrice: 8.00, isTaxable: true },
    ],
    taxTotal: 1.80,
    basketDiscount: 0,
    receiptImages: [],
    claims: {
      'i1': { 'p1': 1 },
      'i2': { 'p2': 1 },
      'i3': { 'p3': 2, 'p4': 2 },
      'i4': {},
    },
    readyParticipantIds: ['p1', 'p2', 'p3', 'p4'],
    status: 'settled',
    createdAt: new Date().toISOString(),
  };

  const summary1 = calculateTripSettlement(mockTrip1, mockHousehold);
  
  const alex1 = summary1.participants.find(p => p.participantId === 'p2')!;
  const sam1 = summary1.participants.find(p => p.participantId === 'p3')!;
  const jordan1 = summary1.participants.find(p => p.participantId === 'p4')!;

  if (round2(alex1.netOwed) !== 13.20) throw new Error(`Alex netOwed mismatch: expected 13.20 got ${alex1.netOwed}`);
  if (round2(sam1.netOwed) !== 3.20) throw new Error(`Sam netOwed mismatch: expected 3.20 got ${sam1.netOwed}`);
  if (round2(jordan1.netOwed) !== 3.20) throw new Error(`Jordan netOwed mismatch: expected 3.20 got ${jordan1.netOwed}`);
  console.log('✅ Test 1 Passed!');

  console.log('--- Test 2: Multiple People Claiming the SAME 1-Quantity Item ---');
  // Joel buys $10.00 Olive Oil (Untaxed, quantity 1). Alex and Sam BOTH claim it.
  // Each of Alex and Sam should owe $5.00, Joel should be owed $10.00 total.
  const mockTrip2: Trip = {
    id: 't2',
    householdId: 'h1',
    storeName: "Trader Joe's",
    date: '2026-08-29',
    payerId: 'p1', // Joel paid
    items: [
      { id: 'i10', name: 'Olive Oil', quantity: 1, unitPrice: 10.00, totalPrice: 10.00, isTaxable: false },
    ],
    taxTotal: 0,
    basketDiscount: 0,
    receiptImages: [],
    claims: {
      'i10': { 'p2': 1, 'p3': 1 }, // Alex (p2) and Sam (p3) both claim 1-qty item
    },
    readyParticipantIds: ['p1', 'p2', 'p3', 'p4'],
    status: 'settled',
    createdAt: new Date().toISOString(),
  };

  const summary2 = calculateTripSettlement(mockTrip2, mockHousehold);
  const alex2 = summary2.participants.find(p => p.participantId === 'p2')!;
  const sam2 = summary2.participants.find(p => p.participantId === 'p3')!;
  const jordan2 = summary2.participants.find(p => p.participantId === 'p4')!;

  console.log(`Alex owes: $${alex2.netOwed} (Expected: $5.00)`);
  console.log(`Sam owes: $${sam2.netOwed} (Expected: $5.00)`);
  console.log(`Jordan owes: $${jordan2.netOwed} (Expected: $0.00)`);

  if (round2(alex2.netOwed) !== 5.00) throw new Error(`Alex netOwed mismatch: expected 5.00 got ${alex2.netOwed}`);
  if (round2(sam2.netOwed) !== 5.00) throw new Error(`Sam netOwed mismatch: expected 5.00 got ${sam2.netOwed}`);
  if (round2(jordan2.netOwed) !== 0.00) throw new Error(`Jordan netOwed mismatch: expected 0.00 got ${jordan2.netOwed}`);

  console.log('✅ Test 2 Passed!');
  console.log('🎉 ALL SANITY CHECKS PASSED!');
}

runSanityCheck();
