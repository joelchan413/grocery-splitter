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
    if (name === '@/lib/payments') return loadModule('../src/lib/payments.ts');
    return nodeRequire(name);
  });
  return mod.exports;
}

const { combineUnpaidBalances, selectUnpaidTrips, selectTripsWithMissingPayer, tripPaymentStatus } = loadModule('../src/lib/combined-balances.ts');
const { recordSharesPaid, clearSharesPaid, sanitizePaidShares, isSharePaymentList, isShareRefList } = loadModule('../src/lib/payments.ts');

const household = {
  id: 'h1',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '', color: '#000', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '', color: '#000', venmoHandle: '@alex' },
    { id: 'p3', name: 'Sam', avatarEmoji: '', color: '#000', venmoHandle: '' },
  ],
};

// One item per roommate, each claimed by that roommate alone, so every share is exact.
function trip(id, payerId, prices, overrides = {}) {
  const items = Object.entries(prices).map(([pid, price]) => ({
    id: `${id}-${pid}`, name: `Item ${pid}`, quantity: 1, unitPrice: price, totalPrice: price, isTaxable: false,
  }));
  const claims = Object.fromEntries(Object.keys(prices).map((pid) => [`${id}-${pid}`, { [pid]: 1 }]));
  return {
    id, householdId: 'h1', storeName: `Store ${id}`, date: `2026-10-0${id.slice(1)}`, payerId, items, taxTotal: 0,
    basketDiscount: 0, receiptImages: [], claims, readyParticipantIds: [], status: 'settled',
    createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const summarize = (payments) => payments.map((p) => [p.from.id, p.to.id, p.amount]);

test('sums what each roommate owes the same payer across trips into one payment', () => {
  const payments = combineUnpaidBalances([trip('t1', 'p1', { p1: 5, p2: 10, p3: 4 }), trip('t2', 'p1', { p2: 2.5, p3: 1 })], household);
  assert.deepEqual(summarize(payments), [['p2', 'p1', 12.5], ['p3', 'p1', 5]]);
  assert.deepEqual(plain(payments[0].trips.map((t) => [t.tripId, t.amount])), [['t1', 10], ['t2', 2.5]]);
});

test('nets out roommates who owe each other', () => {
  const payments = combineUnpaidBalances([trip('t1', 'p1', { p2: 20 }), trip('t2', 'p2', { p1: 5.25 })], household);
  assert.deepEqual(summarize(payments), [['p2', 'p1', 14.75]]);
  assert.deepEqual(plain(payments[0].trips.map((t) => [t.tripId, t.amount])), [['t1', 20], ['t2', -5.25]]);
  assert.deepEqual(plain(payments[0].settles), [
    { tripId: 't1', participantId: 'p2', cents: 2000 },
    { tripId: 't2', participantId: 'p1', cents: 525 },
  ], 'paying the net amount settles both directions at their full amounts');
});

test('keeps pairs that cancel out exactly as a zero payment with no link, so they can be marked settled', () => {
  const [payment, ...rest] = combineUnpaidBalances([trip('t1', 'p1', { p2: 7 }), trip('t2', 'p2', { p1: 7 })], household);
  assert.equal(rest.length, 0);
  assert.equal(payment.amount, 0);
  assert.equal(payment.venmoDeepLink, '');
  assert.equal(payment.settles.length, 2);
});

test('leaves out shares already paid, so a payment covers only what is still owed', () => {
  const trips = [trip('t1', 'p1', { p2: 10, p3: 4 }), trip('t2', 'p1', { p2: 2.5 })];
  const paid = recordSharesPaid({}, [{ tripId: 't1', participantId: 'p2', cents: 1000 }]);
  assert.deepEqual(summarize(combineUnpaidBalances(trips, household, paid)), [['p3', 'p1', 4], ['p2', 'p1', 2.5]]);
});

test('a share that grows after it was paid shows only the difference as owed', () => {
  const paid = recordSharesPaid({}, [{ tripId: 't1', participantId: 'p2', cents: 1000 }]);
  const grown = trip('t1', 'p1', { p2: 25 });
  const status = tripPaymentStatus(grown, household, paid);
  assert.equal(status.isPaidOut, false);
  assert.deepEqual(plain(status.unpaid.map((d) => [d.participant.id, d.owedCents, d.paidCents, d.remainingCents])), [['p2', 2500, 1000, 1500]]);
  assert.deepEqual(summarize(combineUnpaidBalances([grown], household, paid)), [['p2', 'p1', 15]]);
  assert.equal(tripPaymentStatus(trip('t1', 'p1', { p2: 6 }), household, paid).isPaidOut, true, 'a share that shrank stays paid');
});

test('trips whose payer left the household are never combined or sent to another roommate', () => {
  const orphan = trip('t1', 'gone', { p2: 10 });
  const kept = trip('t2', 'p1', { p2: 3 });
  assert.deepEqual(summarize(combineUnpaidBalances([orphan, kept], household)), [['p2', 'p1', 3]]);
  assert.equal(tripPaymentStatus(orphan, household, {}).payerMissing, true);
  assert.equal(tripPaymentStatus(orphan, household, {}).isPaidOut, false);
  assert.deepEqual(selectUnpaidTrips([orphan, kept], household, {}, []).map((t) => t.id), ['t2']);
  assert.deepEqual(selectTripsWithMissingPayer([orphan, kept], household, []).map((t) => t.id), ['t1']);
});

test('payments of the same amount sort the same way whatever order the trips come in', () => {
  const trips = [trip('t1', 'p1', { p2: 5 }), trip('t2', 'p3', { p2: 5 })];
  const forward = summarize(combineUnpaidBalances(trips, household));
  assert.deepEqual(summarize(combineUnpaidBalances([...trips].reverse(), household)), forward);
});

test('a trip is paid out once every roommate who owes on it has paid', () => {
  const t = trip('t1', 'p1', { p1: 3, p2: 10, p3: 4 });
  let paid = {};
  assert.deepEqual(plain(tripPaymentStatus(t, household, paid).unpaid.map((d) => d.participant.id)), ['p2', 'p3']);
  paid = recordSharesPaid(paid, [{ tripId: 't1', participantId: 'p2', cents: 1000 }]);
  assert.equal(tripPaymentStatus(t, household, paid).paidCount, 1);
  assert.equal(tripPaymentStatus(t, household, paid).isPaidOut, false);
  paid = recordSharesPaid(paid, [{ tripId: 't1', participantId: 'p3', cents: 400 }]);
  assert.equal(tripPaymentStatus(t, household, paid).isPaidOut, true);
  assert.equal(tripPaymentStatus(trip('t2', 'p1', { p1: 5 }), household, {}).isPaidOut, true, 'nobody owes, nothing to pay');
});

test('recording payments is idempotent and clearing drops trips with nobody paid', () => {
  const payment = { tripId: 't1', participantId: 'p2', cents: 500 };
  const once = recordSharesPaid({}, [payment]);
  assert.deepEqual(plain(recordSharesPaid(once, [payment])), { t1: { p2: 500 } });
  assert.deepEqual(plain(clearSharesPaid(once, [payment])), {});
  assert.deepEqual(plain(clearSharesPaid(once, [{ tripId: 'nope', participantId: 'p2' }])), { t1: { p2: 500 } });
});

test('stored and received payment records are sanitized', () => {
  assert.deepEqual(plain(sanitizePaidShares({ t1: { p2: 500, p3: -1, p4: 1.5, '': 3 }, t2: ['p2'], t3: {} })), { t1: { p2: 500 } });
  assert.deepEqual(plain(sanitizePaidShares(JSON.parse('{"__proto__": {"p2": 100}, "t1": {"__proto__": 5, "p2": 1}}'))), { t1: { p2: 1 } });
  assert.deepEqual(plain(sanitizePaidShares(null)), {});
});

test('payment requests are validated', () => {
  assert.equal(isSharePaymentList([{ tripId: 't1', participantId: 'p2', cents: 100 }]), true);
  assert.equal(isSharePaymentList([{ tripId: 't1', participantId: 'p2' }]), false, 'recording needs an amount');
  assert.equal(isSharePaymentList([{ tripId: 't1', participantId: 'p2', cents: -1 }]), false);
  assert.equal(isShareRefList([]), false);
  assert.equal(isShareRefList([{ tripId: '__proto__', participantId: 'p2' }]), false);
  assert.equal(isShareRefList(Array.from({ length: 501 }, () => ({ tripId: 't', participantId: 'p' }))), false);
});

test('adds cents exactly and builds a Venmo link to the recipient', () => {
  const trips = [1, 2, 3].map((n) => trip(`t${n}`, 'p1', { p2: 0.1 }));
  const [payment] = combineUnpaidBalances(trips, household);
  assert.equal(payment.amount, 0.3);
  assert.match(payment.venmoDeepLink, /^venmo:\/\/paycharge\?txn=pay&recipients=joel&amount=0\.30&note=Groceries/);
  assert.match(payment.venmoWebLink, /^https:\/\/account\.venmo\.com\/pay\?recipients=joel&amount=0\.30/);
});

test('leaves the link empty when the recipient has no Venmo handle', () => {
  const [payment] = combineUnpaidBalances([trip('t1', 'p3', { p2: 3 })], household);
  assert.equal(payment.venmoDeepLink, '');
  assert.equal(payment.venmoWebLink, '');
});

test('only unpaid, unhidden trips with confirmed items are combined', () => {
  const owing = { p2: 5 };
  const trips = [
    trip('t1', 'p1', owing), trip('t2', 'p1', owing), trip('t3', 'p1', owing),
    trip('t4', 'p1', owing, { status: 'review' }), trip('t5', 'p1', owing, { status: 'claiming' }), trip('t6', 'p1', { p1: 5 }),
  ];
  const paid = { t1: { p2: 500 } };
  assert.deepEqual(selectUnpaidTrips(trips, household, paid, ['t2']).map((t) => t.id), ['t3', 't5']);
});
