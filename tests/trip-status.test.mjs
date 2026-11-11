import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLib } from './helpers/load-lib.mjs';

const { canChangeStatus, nextTripStatus } = loadLib('trip-status');

test('trips only move forward: review, then claiming, then archived', () => {
  const allowed = [
    ['review', 'review'], ['review', 'claiming'],
    ['claiming', 'claiming'], ['claiming', 'settled'],
    ['settled', 'settled'],
  ];
  for (const from of ['review', 'claiming', 'settled']) {
    for (const to of ['review', 'claiming', 'settled']) {
      const expected = allowed.some(([a, b]) => a === from && b === to);
      assert.equal(canChangeStatus(from, to), expected, `${from} -> ${to}`);
    }
  }
});

test('a save that would move a trip backwards keeps its current status', () => {
  assert.equal(nextTripStatus('claiming', 'review'), 'claiming', 'a stale tab still on Check items');
  assert.equal(nextTripStatus('settled', 'claiming'), 'settled', 'a stale tab from before archiving');
  assert.equal(nextTripStatus('review', 'settled'), 'review', 'archiving skips claiming');
  assert.equal(nextTripStatus('review', 'claiming'), 'claiming');
  assert.equal(nextTripStatus('claiming', 'settled'), 'settled');
  assert.equal(nextTripStatus('claiming', 'bogus'), 'claiming');
});

test('a new trip, or one with no known status, takes the status it was sent with', () => {
  assert.equal(nextTripStatus(undefined, 'review'), 'review');
  assert.equal(nextTripStatus(undefined, 'claiming'), 'claiming', 'a cached trip re-uploaded after a server reset');
  assert.equal(nextTripStatus('legacy', 'settled'), 'settled');
});
