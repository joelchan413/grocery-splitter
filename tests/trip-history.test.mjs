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
    if (name === '@/lib/export-csv') return loadModule('../src/lib/export-csv.ts');
    if (name === '@/lib/export-photos') return loadModule('../src/lib/export-photos.ts');
    if (name === '@/lib/zip') return loadModule('../src/lib/zip.ts');
    if (name === '@/components/ExportCsv') return loadModule('../src/components/ExportCsv.tsx');
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
