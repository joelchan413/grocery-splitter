import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

function loadModule(relPath) {
  const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', compiled);
  fn(mod, mod.exports, (name) => {
    if (name === '@/types') return {};
    if (name === '@/lib/calculations') return loadModule('../src/lib/calculations.ts');
    if (name === '@/lib/trip-history') return loadModule('../src/lib/trip-history.ts');
    if (name === '@/lib/person') return loadModule('../src/lib/person.ts');
    if (name === './Avatar') return loadModule('../src/components/Avatar.tsx');
    if (name === './ScannerHome') return loadModule('../src/components/ScannerHome.tsx');
    if (name === 'canvas-confetti') return { __esModule: true, default: () => {} };
    return nodeRequire(name);
  });
  return mod.exports;
}

test('database.json should contain all trips in history so none disappear on fetch', (t) => {
  const dbPath = path.join(__dirname, '../data/database.json');
  if (!fs.existsSync(dbPath)) {
    t.skip('database.json does not exist on fresh checkout');
    return;
  }
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  const tripIdsInTrips = Object.keys(db.trips || {});
  const tripIdsInHistory = (db.history || []).map((t) => t.id);

  // Every trip in trips should be in history
  const missingFromHistory = tripIdsInTrips.filter((id) => !tripIdsInHistory.includes(id));
  assert.deepEqual(
    missingFromHistory,
    [],
    `Trips in db.trips missing from db.history: ${missingFromHistory.join(', ')}`
  );
});

test('history should not contain duplicate trip IDs', (t) => {
  const dbPath = path.join(__dirname, '../data/database.json');
  if (!fs.existsSync(dbPath)) {
    t.skip('database.json does not exist on fresh checkout');
    return;
  }
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const tripIdsInHistory = (db.history || []).map((t) => t.id);
  const uniqueIds = new Set(tripIdsInHistory);
  assert.equal(
    tripIdsInHistory.length,
    uniqueIds.size,
    'db.history contains duplicate trip IDs'
  );
});

test('calculateTripSettlement handles trips with undefined taxTotal, basketDiscount, or items without producing NaN', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [{ id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#000', venmoHandle: '@joel' }],
  };

  const tripWithoutTaxes = {
    id: 't-incomplete',
    householdId: 'h1',
    storeName: 'Test Store',
    date: '2026-08-29',
    payerId: 'p1',
    items: [{ id: 'i1', name: 'Item 1', quantity: 1, unitPrice: 10, totalPrice: 10, isTaxable: false }],
    status: 'claiming',
    createdAt: '2026-08-29T00:00:00.000Z',
    // taxTotal, basketDiscount, claims missing
  };

  const summary = calculateTripSettlement(tripWithoutTaxes, household);
  assert.equal(Number.isNaN(summary.totalBill), false, 'totalBill should not be NaN');
  assert.equal(summary.totalBill, 10, 'totalBill should be 10');
  assert.equal(Number.isNaN(summary.taxTotal), false, 'taxTotal should not be NaN');
  assert.equal(Number.isNaN(summary.basketDiscount), false, 'basketDiscount should not be NaN');

  const tripEmptyItems = {
    id: 't-empty',
    payerId: 'p1',
  };
  const summaryEmpty = calculateTripSettlement(tripEmptyItems, household);
  assert.equal(Number.isNaN(summaryEmpty.totalBill), false);
  assert.equal(summaryEmpty.totalBill, 0);
});

test('the payer share is rounded once', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  // $1.01 shared two ways with $0.01 tax: each half is $0.505 + $0.005, which rounds to $0.51, not $0.52.
  const trip = {
    id: 't-rounding',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-27',
    items: [{ id: 'i1', name: 'Apple', quantity: 1, unitPrice: 1.01, totalPrice: 1.01, isTaxable: true }],
    taxTotal: 0.01,
    basketDiscount: 0,
    claims: {},
  };
  const summary = calculateTripSettlement(trip, household);
  const payer = summary.participants.find((p) => p.isPayer);
  const roommate = summary.participants.find((p) => !p.isPayer);
  assert.equal(summary.totalBill, 1.02);
  assert.equal(roommate.netOwed, 0.51);
  assert.equal(roommate.ownShare, 0.51);
  assert.equal(payer.netOwed, 0);
  assert.equal(payer.ownShare, 0.51);
  assert.match(summary.groupChatSummary, /Joel \(Payer\): \$0\.51 self-share/);
});

test('the shares add up to the bill, with the payer keeping the rounding remainder', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
      { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
    ],
  };
  const trip = {
    id: 't-remainder',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [{ id: 'i1', name: 'Bread', quantity: 1, unitPrice: 1, totalPrice: 1, isTaxable: false }],
    taxTotal: 0,
    basketDiscount: 0,
    claims: {},
  };
  const summary = calculateTripSettlement(trip, household);
  const payer = summary.participants.find((p) => p.isPayer);
  const owed = summary.participants.filter((p) => !p.isPayer).map((p) => p.netOwed);
  assert.deepEqual(owed, [0.33, 0.33]);
  assert.equal(payer.ownShare, 0.34);
  assert.equal(Math.round((payer.ownShare + owed[0] + owed[1]) * 100), Math.round(summary.totalBill * 100));
});

test('roommates never pay more than the bill when the payer has no share', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: ['Joel', 'Alex', 'Sam', 'Jordan'].map((name, i) => ({ id: `p${i + 1}`, name, avatarEmoji: '🛒', color: '#2563EB', venmoHandle: `@${name.toLowerCase()}` })),
  };
  // $10.01 split by the three roommates who are not the payer: $3.3367 each would round to $3.34 x 3 = $10.02.
  const trip = {
    id: 't-overcollect',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [{ id: 'i1', name: 'Cheese', quantity: 1, unitPrice: 10.01, totalPrice: 10.01, isTaxable: false }],
    taxTotal: 0,
    basketDiscount: 0,
    claims: { i1: { p2: 1, p3: 1, p4: 1 } },
  };
  const summary = calculateTripSettlement(trip, household);
  const owed = summary.participants.filter((p) => !p.isPayer).map((p) => p.netOwed);
  const payer = summary.participants.find((p) => p.isPayer);
  assert.equal(Math.round(owed.reduce((a, b) => a + b, 0) * 100), 1001);
  assert.deepEqual([...owed].sort(), [3.33, 3.34, 3.34]);
  assert.equal(payer.ownShare, 0);
  for (const p of summary.participants.filter((p) => !p.isPayer)) {
    assert.match(p.venmoWebLink, new RegExp(`amount=${p.netOwed.toFixed(2)}&`));
  }
});

test('a basket discount larger than the payer\'s items never makes a roommate pay more than the bill', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  const trip = {
    id: 't-big-discount',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [
      { id: 'i1', name: 'Rice', quantity: 1, unitPrice: 10, totalPrice: 10, isTaxable: false },
      { id: 'i2', name: 'Soap', quantity: 1, unitPrice: 10, totalPrice: 10, isTaxable: true },
    ],
    taxTotal: 1,
    basketDiscount: 20.5,
    claims: { i1: { p1: 1 }, i2: { p2: 1 } },
  };
  const summary = calculateTripSettlement(trip, household);
  const alex = summary.participants.find((p) => p.participantId === 'p2');
  const joel = summary.participants.find((p) => p.participantId === 'p1');
  assert.equal(summary.totalBill, 0.5);
  assert.equal(alex.netOwed, 0.5);
  assert.match(alex.venmoWebLink, /amount=0\.50&/);
  assert.equal(joel.ownShare, 0);

  const negative = calculateTripSettlement({ ...trip, basketDiscount: 40 }, household);
  assert.equal(negative.totalBill, 0);
  assert.deepEqual(negative.participants.map((p) => p.netOwed), [0, 0]);
});

test('the copied summary leaves out the Venmo line when the payer has no handle', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  const trip = {
    id: 't-no-handle',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [{ id: 'i1', name: 'Rice', quantity: 1, unitPrice: 10, totalPrice: 10, isTaxable: false }],
    taxTotal: 0,
    basketDiscount: 0,
    claims: {},
  };
  const summary = calculateTripSettlement(trip, household);
  assert.doesNotMatch(summary.groupChatSummary, /via Venmo/);
});

test('a payer or claimant removed from the household is handled like everyone else', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  // Jordan (p9) paid and claimed the steak, then left the household.
  const trip = {
    id: 't-removed',
    payerId: 'p9',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [
      { id: 'i1', name: 'Steak', quantity: 1, unitPrice: 20, totalPrice: 20, isTaxable: false },
      { id: 'i2', name: 'Milk', quantity: 1, unitPrice: 4, totalPrice: 4, isTaxable: false },
    ],
    taxTotal: 0,
    basketDiscount: 0,
    claims: { i1: { p9: 1 } },
  };
  const summary = calculateTripSettlement(trip, household);
  const joel = summary.participants.find((p) => p.participantId === 'p1');
  const alex = summary.participants.find((p) => p.participantId === 'p2');
  assert.equal(summary.payer.id, 'p1');
  assert.equal(joel.isPayer, true);
  assert.equal(joel.netOwed, 0);
  assert.equal(joel.ownShare, 12);
  assert.equal(alex.netOwed, 12);
  assert.equal(alex.itemsShare, 12);
});

test('each breakdown shows its items total rounded once', () => {
  const { calculateTripSettlement } = loadModule('../src/lib/calculations.ts');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  // Alex has $0.505 of a split item and $0.505 of an unclaimed one: $1.01, not $0.51 + $0.51.
  const trip = {
    id: 't-items-share',
    payerId: 'p1',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [
      { id: 'i1', name: 'Apple', quantity: 1, unitPrice: 1.01, totalPrice: 1.01, isTaxable: false },
      { id: 'i2', name: 'Pear', quantity: 1, unitPrice: 1.01, totalPrice: 1.01, isTaxable: false },
    ],
    taxTotal: 0,
    basketDiscount: 0,
    claims: { i1: { p1: 1, p2: 1 } },
  };
  const alex = calculateTripSettlement(trip, household).participants.find((p) => p.participantId === 'p2');
  assert.equal(alex.itemsShare, 1.01);
  assert.equal(alex.netOwed, 1.01);
});

test('mergeTripHistory preserves local trips not yet on server and merges newer updates', () => {
  const storage = loadModule('../src/lib/storage.ts');
  assert.ok(typeof storage.mergeTripHistory === 'function', 'mergeTripHistory function must exist');

  const localHistory = [
    { id: 'trip-local-only', storeName: 'Local Store', createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', date: '2026-08-30' },
    { id: 'trip-shared', storeName: 'Shared Store (Local New)', createdAt: '2026-08-30T12:00:00Z', updatedAt: '2026-08-30T12:00:00Z', date: '2026-08-30' },
  ];

  const serverHistory = [
    { id: 'trip-shared', storeName: 'Shared Store (Server Old)', createdAt: '2026-08-30T12:00:00Z', updatedAt: '2026-08-30T11:00:00Z', date: '2026-08-30' },
    { id: 'trip-server-only', storeName: 'Server Store', updatedAt: '2026-08-29T10:00:00Z', date: '2026-08-29' },
  ];

  const merged = storage.mergeTripHistory(localHistory, serverHistory);

  // Must have all 3 trips
  assert.equal(merged.length, 3, 'Merged history must have 3 trips');
  const ids = merged.map((t) => t.id);
  assert.ok(ids.includes('trip-local-only'), 'Must include local-only trip');
  assert.ok(ids.includes('trip-server-only'), 'Must include server-only trip');
  assert.ok(ids.includes('trip-shared'), 'Must include shared trip');

  // For shared trip, the local version was newer (12:00 vs 11:00)
  const shared = merged.find((t) => t.id === 'trip-shared');
  assert.equal(shared.storeName, 'Shared Store (Local New)');

  // Must be sorted in descending chronological order
  assert.deepEqual(
    merged.map((t) => t.id),
    ['trip-shared', 'trip-local-only', 'trip-server-only']
  );
});

test('history keeps the same order when server responses reverse trips with equal timestamps', () => {
  const { mergeTripHistory } = loadModule('../src/lib/storage.ts');
  const trips = ['trip-a', 'trip-b'].map((id) => ({
    id, date: '2026-08-30', createdAt: '2026-08-30T10:00:00Z',
    updatedAt: '2026-08-30T10:00:00Z',
  }));
  const cached = mergeTripHistory([], trips);
  const reopened = mergeTripHistory(cached, [...trips].reverse());
  assert.deepEqual(reopened.map((trip) => trip.id), cached.map((trip) => trip.id));
});

test('reopening and syncing an older trip does not move it above a newer trip', () => {
  const { mergeTripHistory } = loadModule('../src/lib/storage.ts');
  const trips = [
    { id: 'older', createdAt: '2026-08-29T10:00:00Z', date: '2026-08-29' },
    { id: 'newer', createdAt: '2026-08-30T10:00:00Z', date: '2026-08-30' },
  ];
  const cached = mergeTripHistory([], trips);
  // Hydration registers the saved active trip; the server may assign updatedAt.
  const reopened = mergeTripHistory(cached, [
    { ...trips[0], updatedAt: '2026-08-31T10:00:00Z', storeName: 'Synced' },
    trips[1],
  ]);
  assert.equal(reopened.find((trip) => trip.id === 'older').storeName, 'Synced');
  assert.deepEqual(reopened.map((trip) => trip.id), cached.map((trip) => trip.id));
});

test('history display and cache merge agree after updates, ties, and JSON restoration', () => {
  const { mergeTripHistory } = loadModule('../src/lib/storage.ts');
  const { TripHistory } = loadModule('../src/components/TripHistory.tsx');
  const household = { participants: [] };
  const trips = [
    { id: 'b', storeName: 'Tie B', createdAt: '2026-08-30T10:00:00Z' },
    { id: 'old', storeName: 'Older Trip', createdAt: '2026-08-29T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'a', storeName: 'Tie A', createdAt: '2026-08-30T10:00:00Z' },
  ];
  const cached = mergeTripHistory([], trips);
  const restored = JSON.parse(JSON.stringify(cached));
  const reopened = mergeTripHistory(restored, [...trips].reverse());
  for (const history of [trips, restored, reopened]) {
    const html = renderToStaticMarkup(createElement(TripHistory, {
      history, household, onSelectTrip: () => {}, onBackToActive: () => {},
    }));
    assert.ok(html.indexOf('Tie A') < html.indexOf('Tie B'));
    assert.ok(html.indexOf('Tie B') < html.indexOf('Older Trip'));
  }
  assert.deepEqual(reopened.map((trip) => trip.id), ['a', 'b', 'old']);
});

test('legacy trips fall back to receipt dates and undated trips have a fixed order', () => {
  const { sortTripHistory } = loadModule('../src/lib/trip-history.ts');
  const trips = [
    { id: 'b', updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'older', date: '2026-08-29' },
    { id: 'a', createdAt: 'invalid', date: 'invalid' },
    { id: 'newer', createdAt: 'invalid', date: '2026-08-30' },
  ];
  const original = [...trips];
  assert.deepEqual(sortTripHistory(trips).map((trip) => trip.id), ['newer', 'older', 'a', 'b']);
  assert.deepEqual(sortTripHistory([...trips].reverse()).map((trip) => trip.id), ['newer', 'older', 'a', 'b']);
  assert.deepEqual(trips, original, 'sorting must not mutate the input');
});

test('the claiming screen ignores claims from removed roommates and follows the fallback payer', () => {
  const { ClaimingBoard } = loadModule('../src/components/ClaimingBoard.tsx');
  const household = {
    id: 'h1',
    name: 'Household',
    participants: [
      { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
      { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    ],
  };
  // Jordan (p9) paid and claimed both eggs, then left the household.
  const trip = {
    id: 't-claiming-removed',
    householdId: 'h1',
    payerId: 'p9',
    storeName: 'Corner Store',
    date: '2026-10-28',
    items: [{ id: 'i1', name: 'Eggs', quantity: 2, unitPrice: 3, totalPrice: 6, isTaxable: false }],
    taxTotal: 0,
    basketDiscount: 0,
    claims: { i1: { p9: 2 } },
    readyParticipantIds: [],
    status: 'claiming',
    createdAt: '2026-10-28T00:00:00.000Z',
  };
  const html = renderToStaticMarkup(createElement(ClaimingBoard, {
    trip,
    household,
    activeParticipantId: 'p1',
    onSelectParticipant: () => {},
    onUpdateTrip: () => {},
    onViewSettlement: () => {},
    onBackToReview: () => {},
  }));
  assert.match(html, /Shared by everyone, \$3\.00 each/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*aria-label="Claim one more Eggs"/);
  assert.match(html, /Paid the bill/);
  assert.match(html, /Joel&#x27;s own share/);
});
