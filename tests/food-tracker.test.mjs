import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLib } from './helpers/load-lib.mjs';

const tracker = loadLib('food-tracker');

const household = {
  id: 'h1',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '', color: '#000', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '', color: '#000', venmoHandle: '@alex' },
  ],
};

function item(id, price, isTaxable) {
  return { id, name: id, quantity: 1, unitPrice: price, totalPrice: price, isTaxable };
}

// Joel claims milk ($4, food) and shampoo ($10, taxed 10%); Alex claims bread ($6, food). Alex paid.
function trip(overrides = {}) {
  return {
    id: 't1', householdId: 'h1', storeName: 'Hy-Vee', date: '2026-10-28', payerId: 'p2',
    items: [item('milk', 4, false), item('shampoo', 10, true), item('bread', 6, false)],
    taxTotal: 1, basketDiscount: 0, receiptImages: ['data:image/jpeg;base64,AAAA'],
    claims: { milk: { p1: 1 }, shampoo: { p1: 1 }, bread: { p2: 1 } },
    readyParticipantIds: ['p1', 'p2'], status: 'claiming', createdAt: '2026-10-28T12:00:00.000Z', ...overrides,
  };
}

test('splits a share into food and non-food before tax, with the total including tax', () => {
  assert.deepEqual({ ...tracker.foodShareCents(trip(), household, 'p1') }, { totalCents: 1500, foodCents: 400, nonFoodCents: 1000 });
});

test('a basket discount comes off food and non-food in proportion', () => {
  // Joel has $14 of $20 in items, so $1.40 of a $2 discount: 4/14 of it off food, 10/14 off non-food.
  const share = tracker.foodShareCents(trip({ basketDiscount: 2 }), household, 'p1');
  assert.deepEqual({ ...share }, { totalCents: 1360, foodCents: 360, nonFoodCents: 900 });
});

test('unclaimed items are shared, so half of them count toward each share', () => {
  const share = tracker.foodShareCents(trip({ claims: {} }), household, 'p1');
  assert.equal(share.foodCents, 500);
  assert.equal(share.nonFoodCents, 500);
});

test('a trip is fully paid only once every roommate has paid back their share', () => {
  assert.equal(tracker.isTripFullyPaid(trip(), household, {}, []), false);
  assert.equal(tracker.isTripFullyPaid(trip(), household, { t1: { p1: 1500 } }, []), true);
  assert.equal(tracker.isTripFullyPaid(trip(), household, { t1: { p1: 1000 } }, []), false, 'a partial payment is not enough');
  assert.equal(tracker.isTripFullyPaid(trip(), household, { t1: { p1: 1500 } }, ['t1']), false, 'hidden trips are left out');
  assert.equal(tracker.isTripFullyPaid(trip({ status: 'review' }), household, { t1: { p1: 1500 } }, []), false);
});

test('a trip nobody owes on counts as paid only once everyone is done claiming', () => {
  const alone = { claims: { milk: { p2: 1 }, shampoo: { p2: 1 }, bread: { p2: 1 } } };
  assert.equal(tracker.isTripFullyPaid(trip({ ...alone, readyParticipantIds: [] }), household, {}, []), false);
  assert.equal(tracker.isTripFullyPaid(trip(alone), household, {}, []), true);
});

test('the row names the photo like the receipts folder and notes who paid', () => {
  const row = tracker.foodTrackerRow(trip(), household, household.participants[0]);
  assert.deepEqual([...row.fileNames], ['Receipt - Hy-Vee - Oct 28, 2026.jpg']);
  assert.equal(row.date, '2026-10-28');
  assert.equal(row.shareTotal, 15);
  assert.equal(row.food, 4);
  assert.equal(row.nonFood, 10);
  assert.match(row.notes, /Joel's share of a \$21\.00 receipt, paid by Alex/);
});

test('several photos are numbered, and other image types keep their extension', () => {
  const names = tracker.receiptFileNames(trip({ storeName: 'Trader/Joe' }), ['data:image/png;base64,A', 'data:image/webp;base64,B']);
  assert.deepEqual([...names], ['Receipt - Trader-Joe - Oct 28, 2026 (1 of 2).png', 'Receipt - Trader-Joe - Oct 28, 2026 (2 of 2).webp']);
});

test('no row when the roommate has no share in the trip', () => {
  const alone = trip({ claims: { milk: { p2: 1 }, shampoo: { p2: 1 }, bread: { p2: 1 } } });
  assert.equal(tracker.foodTrackerRow(alone, household, household.participants[0]), null);
});

test('the roommate can be named by id or by name, ignoring case', () => {
  assert.equal(tracker.findTrackedParticipant(household, 'p1')?.name, 'Joel');
  assert.equal(tracker.findTrackedParticipant(household, ' joel ')?.id, 'p1');
  assert.equal(tracker.findTrackedParticipant(household, 'Sam'), undefined);
});

test('stored state keeps only well-formed entries', () => {
  const state = tracker.sanitizeFoodTrackerState({
    startedAt: '2026-11-10T00:00:00.000Z',
    logged: { t1: { skipped: true }, t2: { row: '{}', loggedAt: 'x' }, t3: { row: 5 }, __proto__: { skipped: true } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    startedAt: '2026-11-10T00:00:00.000Z', logged: { t1: { skipped: true }, t2: { row: '{}', loggedAt: 'x' } },
  });
});
