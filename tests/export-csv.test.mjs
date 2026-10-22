import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

function loadModule(relPath) {
  const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, (name) => {
    if (name === '@/lib/calculations') return loadModule('../src/lib/calculations.ts');
    return nodeRequire(name);
  });
  return mod.exports;
}

const { exportTripsToCsv, selectTripsForExport, defaultExportRange, escapeCsvField, EXPORT_COLUMNS } = loadModule('../src/lib/export-csv.ts');

const household = {
  id: 'h1',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#000', venmoHandle: '@joel-private' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#000', venmoHandle: '@alex-private' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#000', venmoHandle: '@sam-private' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#000', venmoHandle: '@jordan-private' },
  ],
};

function trip(overrides) {
  return {
    householdId: 'h1',
    taxTotal: 0,
    basketDiscount: 0,
    receiptImages: [],
    claims: {},
    readyParticipantIds: [],
    status: 'settled',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(id, name, quantity, unitPrice, isTaxable) {
  return { id, name, quantity, unitPrice, totalPrice: quantity * unitPrice, isTaxable };
}

const trips = [
  // Comma in the store name; split unevenly (Alex claims a taxable item and a share of the shared towels).
  trip({
    id: 't-b', storeName: "Trader Joe's, Downtown", date: '2026-03-05', payerId: 'p1', taxTotal: 1.8,
    items: [
      item('i1', 'Milk', 1, 4, false),
      item('i2', 'Hard Cider', 1, 10, true),
      item('i3', 'Bananas', 4, 0.5, false),
      item('i4', 'Paper Towels', 1, 8, true),
    ],
    claims: { i1: { p1: 1 }, i2: { p2: 1 }, i3: { p3: 2, p4: 2 }, i4: {} },
  }),
  // Same date as t-b, so the receipt_id tie-break applies. Quotes and a comma in the store name; Alex paid.
  trip({
    id: 't-a', storeName: 'Corner "Deli", Inc.', date: '2026-03-05', payerId: 'p2', taxTotal: 0.8,
    items: [item('i1', 'Party Tray', 1, 10, true)],
  }),
  // First day of the range; Alex shares half of one item with Jordan.
  trip({
    id: 't-c', storeName: 'Corner Co-op', date: '2026-01-01', payerId: 'p3',
    items: [item('i1', 'Rice', 1, 12, false)],
    claims: { i1: { p2: 1, p4: 1 } },
  }),
  // Last day of the range; non-ASCII store name, equal split of an unclaimed item.
  trip({
    id: 't-f', storeName: 'Café Möller', date: '2026-12-31', payerId: 'p1',
    items: [item('i1', 'Snacks', 1, 5, false)],
  }),
  // Alex neither paid nor has a share: excluded.
  trip({
    id: 't-h', storeName: 'Not Mine', date: '2026-06-01', payerId: 'p3',
    items: [item('i1', 'Beans', 1, 12, false)],
    claims: { i1: { p3: 1, p4: 1 } },
  }),
  // Outside the range: excluded.
  trip({ id: 't-d', storeName: 'Last Year', date: '2025-12-31', payerId: 'p2', items: [item('i1', 'Tea', 1, 3, false)] }),
  // No valid purchase date: cannot be placed in a range, so skipped and counted.
  trip({ id: 't-e', storeName: 'Odd Date', date: '03/05/2026', payerId: 'p2', items: [item('i1', 'Tea', 1, 3, false)] }),
];

test('exports Alex\'s 2026 trips exactly, sorted by date then receipt_id', () => {
  const result = exportTripsToCsv(trips, household, 'p2', '2026-01-01', '2026-12-31');
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 4);
  assert.equal(result.skippedUndated, 1);
  // The trips behind the rows come back in row order, so attachments (photos) always match the CSV.
  assert.deepEqual(result.trips.map((t) => t.id), ['t-c', 't-a', 't-b', 't-f']);

  const expected = [
    'date,store,receipt_total,food_subtotal,non_food_subtotal,tax,paid_by,my_share,split_method,venmo_status,notes,receipt_id',
    '2026-01-01,Corner Co-op,12.00,,,0.00,Sam,6.00,,,,t-c',
    '2026-03-05,"Corner ""Deli"", Inc.",10.80,,,0.80,Alex,2.70,,,,t-a',
    '2026-03-05,"Trader Joe\'s, Downtown",25.80,,,1.80,Joel,13.20,,,,t-b',
    '2026-12-31,Café Möller,5.00,,,0.00,Joel,1.25,,,,t-f',
  ].join('\r\n') + '\r\n';
  assert.equal(result.csv, expected);
});

test('the header matches the requested column order', () => {
  assert.deepEqual([...EXPORT_COLUMNS], [
    'date', 'store', 'receipt_total', 'food_subtotal', 'non_food_subtotal', 'tax',
    'paid_by', 'my_share', 'split_method', 'venmo_status', 'notes', 'receipt_id',
  ]);
});

test('the export reflects the chosen participant and the chosen date range', () => {
  const joel = exportTripsToCsv(trips, household, 'p1', '2026-03-01', '2026-03-31');
  assert.equal(joel.ok, true);
  // Joel paid t-b (his own share: 4.00 milk + 2.00 towels + 0.20 tax) and has an equal share of t-a.
  assert.deepEqual(joel.csv.trim().split('\r\n').slice(1), [
    '2026-03-05,"Corner ""Deli"", Inc.",10.80,,,0.80,Alex,2.70,,,,t-a',
    '2026-03-05,"Trader Joe\'s, Downtown",25.80,,,1.80,Joel,6.20,,,,t-b',
  ]);
});

test('never exposes Venmo handles and does not modify the trips', () => {
  const before = JSON.parse(JSON.stringify({ trips, household }));
  const result = exportTripsToCsv(trips, household, 'p2', '2025-01-01', '2026-12-31');
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.csv, /private|@|venmo:/i);
  assert.deepEqual({ trips, household }, before);
});

test('an empty range still produces a header-only file', () => {
  const result = exportTripsToCsv(trips, household, 'p2', '2030-01-01', '2030-12-31');
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 0);
  assert.equal(result.csv.trim().split('\r\n').length, 1);
});

test('rejects invalid ranges and unknown participants instead of guessing', () => {
  assert.equal(exportTripsToCsv(trips, household, 'p2', '2026-12-31', '2026-01-01').ok, false);
  assert.equal(exportTripsToCsv(trips, household, 'p2', '', '2026-01-01').ok, false);
  assert.equal(exportTripsToCsv(trips, household, 'p2', '2026-02-30', '2026-03-01').ok, false);
  assert.equal(exportTripsToCsv(trips, household, 'nobody', '2026-01-01', '2026-12-31').ok, false);
});

test('fields with commas, quotes, or newlines are quoted and quotes doubled', () => {
  assert.equal(escapeCsvField('plain'), 'plain');
  assert.equal(escapeCsvField('a,b'), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField('two\nlines'), '"two\nlines"');
  assert.equal(escapeCsvField('two\r\nlines'), '"two\r\nlines"');
});

test('hidden and unchecked trips are left out of the export; hidden always wins', () => {
  const ids = (list) => list.map((t) => t.id);
  assert.deepEqual(ids(selectTripsForExport(trips, [], [])), ids(trips));
  assert.deepEqual(ids(selectTripsForExport(trips, ['t-a'], ['t-b'])), ['t-c', 't-f', 't-h', 't-d', 't-e']);
  // A trip that is both unchecked and hidden is simply excluded once.
  assert.deepEqual(ids(selectTripsForExport(trips, ['t-a'], ['t-a'])), ids(trips).filter((id) => id !== 't-a'));

  const selected = selectTripsForExport(trips, ['t-a'], ['t-f']);
  const result = exportTripsToCsv(selected, household, 'p2', '2026-01-01', '2026-12-31');
  assert.equal(result.ok, true);
  assert.deepEqual(result.csv.trim().split('\r\n').slice(1).map((row) => row.split(',').pop()), ['t-c', 't-b']);
});

test('selecting trips does not modify the original list', () => {
  const copy = [...trips];
  selectTripsForExport(trips, ['t-a'], ['t-b']);
  assert.deepEqual(trips, copy);
});

test('the default range is the current calendar year', () => {
  assert.deepEqual(defaultExportRange(new Date(2026, 9, 22)), { start: '2026-01-01', end: '2026-12-31' });
});
