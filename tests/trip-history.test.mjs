import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadModule(relPath) {
  const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', compiled);
  fn(mod, mod.exports, (name) => {
    if (name === '@/types') return {};
    if (name === '@/lib/calculations') return loadModule('../src/lib/calculations.ts');
    return {};
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
    { id: 'trip-local-only', storeName: 'Local Store', updatedAt: '2026-08-30T10:00:00Z', date: '2026-08-30' },
    { id: 'trip-shared', storeName: 'Shared Store (Local New)', updatedAt: '2026-08-30T12:00:00Z', date: '2026-08-30' },
  ];

  const serverHistory = [
    { id: 'trip-shared', storeName: 'Shared Store (Server Old)', updatedAt: '2026-08-30T11:00:00Z', date: '2026-08-30' },
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
