import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLib } from './helpers/load-lib.mjs';

const rules = loadLib('notification-rules');
const subs = loadLib('push-subscriptions');
const plain = (value) => JSON.parse(JSON.stringify(value));

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
    basketDiscount: 0, receiptImages: [], claims, readyParticipantIds: [], status: 'claiming',
    createdAt: '2026-11-01T12:00:00.000Z', ...overrides,
  };
}

const recipients = (outgoing) => outgoing.map((o) => o.participantId);
const empty = () => rules.emptyNotificationState();

// ----------------- 1. Trip submitted -----------------

test('a trip confirmed out of review tells everyone but the payer, with the total', () => {
  const before = trip('t1', 'p1', { p1: 5, p2: 10 }, { status: 'review' });
  const after = { ...before, status: 'claiming' };
  assert.equal(rules.isNewlySubmitted(before, after, empty()), true);
  const outgoing = rules.tripSubmittedMessages(after, household);
  assert.deepEqual(recipients(outgoing), ['p2', 'p3']);
  assert.equal(outgoing[0].message.body, 'Joel added a $15.00 receipt. Claim what\'s yours.');
  assert.equal(outgoing[0].message.url, '/?view=claiming&trip=t1');
});

test('a trip is announced once, and never while it is still being reviewed or for later saves', () => {
  const claiming = trip('t1', 'p1', { p2: 10 });
  assert.equal(rules.isNewlySubmitted(null, claiming, empty()), true, 'uploaded straight into claiming');
  assert.equal(rules.isNewlySubmitted(null, { ...claiming, status: 'review' }, empty()), false);
  assert.equal(rules.isNewlySubmitted(claiming, claiming, empty()), false, 'a claim on a trip already claiming');
  const state = { ...empty(), submitted: { t1: '2026-11-01T12:00:00.000Z' } };
  assert.equal(rules.isNewlySubmitted({ ...claiming, status: 'review' }, claiming, state), false, 'sent back to review and confirmed again');
});

// ----------------- 2. Everyone ready -----------------

test('everyone ready counts every roommate, the payer too, and tells all of them what they owe', () => {
  const t = trip('t1', 'p1', { p1: 5, p2: 10, p3: 4 }, { readyParticipantIds: ['p2', 'p3'] });
  assert.equal(rules.isEveryoneReady(t, household), false);
  const ready = { ...t, readyParticipantIds: ['p1', 'p2', 'p3'] };
  assert.equal(rules.isEveryoneReady(ready, household), true);
  assert.equal(rules.isEveryoneReady({ ...ready, status: 'review' }, household), false);

  const outgoing = rules.everyoneReadyMessages(ready, household);
  assert.deepEqual(outgoing.map((o) => [o.participantId, o.message.body]), [
    ['p1', 'Roommates owe you $14.00 in total.'],
    ['p2', 'You owe Joel $10.00.'],
    ['p3', 'You owe Joel $4.00.'],
  ]);
});

test('ready trips nobody was told about get caught up; only recent ones are announced', () => {
  const allReady = ['p1', 'p2', 'p3'];
  const now = new Date('2026-11-03T15:00:00.000Z');
  const recent = trip('t1', 'p1', { p2: 10 }, { readyParticipantIds: allReady, updatedAt: '2026-11-03T14:59:00.000Z' });
  const old = trip('t2', 'p1', { p2: 10 }, { readyParticipantIds: allReady, updatedAt: '2026-10-01T00:00:00.000Z' });
  const told = trip('t3', 'p1', { p2: 10 }, { readyParticipantIds: allReady, updatedAt: '2026-11-03T14:59:00.000Z' });
  const hidden = trip('t4', 'p1', { p2: 10 }, { readyParticipantIds: allReady, updatedAt: '2026-11-03T14:59:00.000Z' });
  const waiting = trip('t5', 'p1', { p2: 10 }, { readyParticipantIds: ['p1'] });
  const archived = trip('t6', 'p1', { p2: 10 }, { status: 'settled', readyParticipantIds: allReady, updatedAt: '2026-11-03T14:59:00.000Z' });
  const reviewing = trip('t7', 'p1', { p2: 10 }, { status: 'review', readyParticipantIds: allReady, updatedAt: '2026-11-03T14:59:00.000Z' });
  const state = { ...empty(), allReady: { t3: '2026-11-03T14:00:00.000Z' } };
  const { mark, announce } = rules.readyTripsToCatchUp([recent, old, told, hidden, waiting, archived, reviewing], household, ['t4'], state, now);
  assert.deepEqual(mark.map((t) => t.id), ['t1', 't2', 't6']);
  assert.deepEqual(announce.map((t) => t.id), ['t1', 't6'], 'archived during the wait, just before a restart');
});

// ----------------- 3. Payment received -----------------

test('a payment tells whoever received it, combining every trip they were paid for', () => {
  const trips = { t1: trip('t1', 'p1', { p2: 10 }), t2: trip('t2', 'p1', { p2: 2.5 }) };
  const outgoing = rules.paymentReceivedMessages({}, { t1: { p2: 1000 }, t2: { p2: 250 } }, trips, household);
  assert.deepEqual(plain(outgoing), [{
    participantId: 'p1',
    message: { title: 'Alex paid you $12.50', body: 'Marked paid for Store t1 and Store t2.', url: '/?view=settle-up', tag: 'paid-p2' },
  }]);
});

test('a netted payment between two roommates tells only the one who came out ahead, for the net amount', () => {
  const trips = { t1: trip('t1', 'p1', { p2: 20 }), t2: trip('t2', 'p2', { p1: 5.25 }) };
  const outgoing = rules.paymentReceivedMessages({}, { t1: { p2: 2000 }, t2: { p1: 525 } }, trips, household);
  assert.deepEqual(outgoing.map((o) => [o.participantId, o.message.title]), [['p1', 'Alex paid you $14.75']]);
});

test('payments to different people tell each of them, and only increases count', () => {
  const trips = { t1: trip('t1', 'p1', { p2: 10 }), t2: trip('t2', 'p3', { p2: 4 }) };
  const before = { t1: { p2: 1000 } };
  const outgoing = rules.paymentReceivedMessages(before, { t1: { p2: 1000 }, t2: { p2: 400 } }, trips, household);
  assert.deepEqual(outgoing.map((o) => [o.participantId, o.message.title]), [['p3', 'Alex paid you $4.00']]);
  assert.deepEqual(rules.paymentReceivedMessages({ t1: { p2: 1000 } }, {}, trips, household), [], 'marking unpaid sends nothing');
});

test('payments on hidden trips are left out of what the recipient is told', () => {
  const trips = { t1: trip('t1', 'p1', { p2: 10 }), t2: trip('t2', 'p1', { p2: 2.5 }) };
  const after = { t1: { p2: 1000 }, t2: { p2: 250 } };
  const outgoing = rules.paymentReceivedMessages({}, after, trips, household, ['t2']);
  assert.deepEqual(outgoing.map((o) => [o.message.title, o.message.body]), [['Alex paid you $10.00', 'Marked paid for Store t1.']]);
  assert.deepEqual(rules.paymentReceivedMessages({}, { t2: { p2: 250 } }, trips, household, ['t2']), [], 'only a hidden trip paid');
});

test('a top-up after a share grew announces only the extra amount', () => {
  const trips = { t1: trip('t1', 'p1', { p2: 12 }) };
  const outgoing = rules.paymentReceivedMessages({ t1: { p2: 1000 } }, { t1: { p2: 1200 } }, trips, household);
  assert.equal(outgoing[0].message.title, 'Alex paid you $2.00');
});

// ----------------- 4. Share increased after paying -----------------

test('a roommate who paid is told when claims make them owe more, once per increase', () => {
  const t = trip('t1', 'p1', { p2: 12, p3: 4 });
  const paid = { t1: { p2: 1000, p3: 400 } };
  const first = rules.shareIncreaseMessages(t, household, paid, {});
  assert.deepEqual(recipients(first.outgoing), ['p2']);
  assert.equal(first.outgoing[0].message.body, 'Claims changed after you paid. You still owe Joel $2.00.');
  assert.deepEqual(plain(first.next), { p2: 200 });

  assert.deepEqual(rules.shareIncreaseMessages(t, household, paid, first.next).outgoing, [], 'nothing new to say');
  const grew = trip('t1', 'p1', { p2: 13, p3: 4 });
  assert.equal(rules.shareIncreaseMessages(grew, household, paid, first.next).outgoing.length, 1, 'grew again');
});

test('a share that drops and then rises again is announced again', () => {
  const paid = { t1: { p2: 1000 } };
  const lower = rules.shareIncreaseMessages(trip('t1', 'p1', { p2: 11 }), household, paid, { p2: 200 });
  assert.deepEqual(lower.outgoing, []);
  assert.deepEqual(plain(lower.next), { p2: 100 });
  const higher = rules.shareIncreaseMessages(trip('t1', 'p1', { p2: 12 }), household, paid, lower.next);
  assert.equal(higher.outgoing.length, 1);
});

test('roommates who never paid, or whose share went down, are not told; settling up clears the record', () => {
  const t = trip('t1', 'p1', { p2: 8, p3: 4 });
  const result = rules.shareIncreaseMessages(t, household, { t1: { p2: 1000 } }, { p2: 200 });
  assert.deepEqual(result.outgoing, []);
  assert.deepEqual(plain(result.next), {});
});

// ----------------- 5. Reminders -----------------

const NOW = new Date('2026-11-03T15:00:00.000Z');

test('roommates who have not claimed a day after a trip was submitted get one reminder', () => {
  const t = trip('t1', 'p1', { p1: 5, p2: 10 }, { readyParticipantIds: ['p1'] });
  const state = { ...empty(), submitted: { t1: '2026-11-02T14:00:00.000Z' } };
  const outgoing = rules.dueReminders({ trips: [t], household, paid: {}, hiddenIds: [], state, now: NOW });
  assert.deepEqual(outgoing.map((o) => [o.participantId, o.message.body]), [
    ['p2', 'Don\'t forget to claim your items from Store t1.'],
    ['p3', 'Don\'t forget to claim your items from Store t1.'],
  ]);

  const early = { ...empty(), submitted: { t1: '2026-11-02T16:00:00.000Z' } };
  assert.deepEqual(rules.dueReminders({ trips: [t], household, paid: {}, hiddenIds: [], state: early, now: NOW }), []);
  assert.deepEqual(rules.dueReminders({ trips: [t], household, paid: {}, hiddenIds: ['t1'], state, now: NOW }), [], 'hidden trips');
  const stale = { ...t, createdAt: '2026-10-01T00:00:00.000Z' };
  assert.deepEqual(rules.dueReminders({ trips: [stale], household, paid: {}, hiddenIds: [], state: empty(), now: NOW }), [],
    'an abandoned trip stops nagging after a week');
});

test('payment reminders start a day after everyone is done and use the combined amount per person', () => {
  const t1 = trip('t1', 'p1', { p2: 10, p3: 4 }, { status: 'settled', updatedAt: '2026-11-01T00:00:00.000Z' });
  const t2 = trip('t2', 'p1', { p2: 2.5 }, { readyParticipantIds: ['p1', 'p2', 'p3'] });
  const state = { ...empty(), allReady: { t2: '2026-11-03T10:00:00.000Z' } };
  const outgoing = rules.dueReminders({ trips: [t1, t2], household, paid: { t1: { p3: 400 } }, hiddenIds: [], state, now: NOW });
  assert.deepEqual(plain(outgoing), [{
    participantId: 'p2',
    message: { title: 'Grocery money reminder', body: 'Don\'t forget to pay Joel $12.50.', url: '/?view=settle-up', tag: 'reminder' },
  }], 'Alex owes on a trip that is due, so the reminder covers everything owed to Joel; Sam already paid');

  const notYet = rules.dueReminders({ trips: [t2], household, paid: {}, hiddenIds: [], state, now: NOW });
  assert.deepEqual(notYet, [], 'everyone finished claiming only five hours ago');
});

test('claiming and paying go in one reminder, at most once a day', () => {
  const owed = trip('t1', 'p1', { p2: 10 }, { status: 'settled', updatedAt: '2026-11-01T00:00:00.000Z' });
  const open = trip('t2', 'p3', { p2: 3 }, { readyParticipantIds: ['p1', 'p3'] });
  const state = { ...empty(), submitted: { t2: '2026-11-02T10:00:00.000Z' } };
  const [reminder, ...others] = rules.dueReminders({ trips: [owed, open], household, paid: {}, hiddenIds: [], state, now: NOW });
  assert.equal(others.length, 0);
  assert.equal(reminder.participantId, 'p2');
  assert.equal(reminder.message.body, 'Don\'t forget to claim your items from Store t2 and pay Joel $10.00.');

  const recent = { ...state, lastReminder: { p2: '2026-11-03T00:00:00.000Z' } };
  assert.deepEqual(rules.dueReminders({ trips: [owed, open], household, paid: {}, hiddenIds: [], state: recent, now: NOW }), []);
  const yesterday = { ...state, lastReminder: { p2: '2026-11-02T15:30:00.000Z' } };
  assert.equal(rules.dueReminders({ trips: [owed, open], household, paid: {}, hiddenIds: [], state: yesterday, now: NOW }).length, 1,
    'the hourly check can send a little under 24 hours later instead of skipping a day');
});

test('reminders only go out during the day in the household time zone', () => {
  assert.equal(rules.isReminderHour(new Date('2026-11-03T15:00:00.000Z'), 'America/New_York'), true);
  assert.equal(rules.isReminderHour(new Date('2026-11-03T03:00:00.000Z'), 'America/New_York'), false);
  assert.equal(rules.isReminderHour(new Date('2026-11-03T15:00:00.000Z'), 'Not/AZone'), rules.isReminderHour(new Date('2026-11-03T15:00:00.000Z')));
});

test('damaged notification state is cleaned instead of breaking saves', () => {
  assert.deepEqual(plain(rules.sanitizeNotificationState(null)), plain(empty()));
  const cleaned = rules.sanitizeNotificationState({
    submitted: { t1: '2026-11-01T00:00:00.000Z', t2: 'not a date', __proto__: 'x' },
    shareIncrease: { t1: { p2: 200, p3: -1 } },
    lastReminder: [],
  });
  assert.deepEqual(plain(cleaned), { submitted: { t1: '2026-11-01T00:00:00.000Z' }, allReady: {}, shareIncrease: { t1: { p2: 200 } }, lastReminder: {} });
});

// ----------------- Subscriptions -----------------

const browserSub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BKey' + n, auth: 'auth' + n } });

test('a device subscribes once and moves when it picks another roommate', () => {
  let list = subs.upsertSubscription([], { ...browserSub(1), participantId: 'p1', createdAt: 'a' });
  list = subs.upsertSubscription(list, { ...browserSub(1), participantId: 'p2', createdAt: 'b' });
  assert.deepEqual(list.map((s) => [s.endpoint, s.participantId]), [['https://fcm.googleapis.com/fcm/send/1', 'p2']]);
  assert.deepEqual(subs.removeSubscriptions(list, ['https://fcm.googleapis.com/fcm/send/1']), []);
});

test('only real push services are accepted, so the server never sends requests to other hosts', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-by3p.notify.windows.com/w/?token=abc',
  ]) assert.equal(subs.isPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://127.0.0.1/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://grocery-splitter:3000/api/trips',
    'https://fcm.googleapis.com.evil.example/abc',
    'https://evilpush.services.mozilla.com.example/abc',
    'https://user:pass@fcm.googleapis.com/abc',
  ]) assert.equal(subs.isPushEndpoint(endpoint), false, endpoint);
  assert.deepEqual(subs.sanitizeSubscriptions([{ endpoint: 'https://10.0.0.5/x', keys: { p256dh: 'a', auth: 'b' }, participantId: 'p1', createdAt: 'x' }]), [],
    'devices saved before the check are dropped when read');
});

test('only network errors, rate limits and push-service outages are retried', () => {
  assert.deepEqual([undefined, 429, 500, 503, 400, 403, 413].map(subs.isTransientPushFailure), [true, true, true, true, false, false, false]);
});

test('subscriptions need valid keys, and caps drop the oldest devices', () => {
  assert.equal(subs.parseBrowserSubscription({ ...browserSub(1), endpoint: 'http://169.254.169.254/' }), null);
  assert.equal(subs.parseBrowserSubscription({ endpoint: browserSub(1).endpoint, keys: { p256dh: 'has spaces', auth: 'x' } }), null);
  assert.ok(subs.parseBrowserSubscription(browserSub(1)));

  let list = [];
  for (let n = 0; n < subs.MAX_SUBSCRIPTIONS_PER_PERSON + 2; n++) {
    list = subs.upsertSubscription(list, { ...browserSub(n), participantId: 'p1', createdAt: String(n) });
  }
  assert.equal(list.length, subs.MAX_SUBSCRIPTIONS_PER_PERSON);
  assert.equal(list[0].endpoint, 'https://fcm.googleapis.com/fcm/send/2');
});
