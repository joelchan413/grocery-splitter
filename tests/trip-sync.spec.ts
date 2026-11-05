import { test, expect } from '@playwright/test';
import { readCachedTrip, photoRecordCount } from './helpers/trip-cache';
import { DEFAULT_HOUSEHOLD } from '../src/lib/storage';
import type { Trip } from '../src/types';
import { TRADER_JOES } from './fixtures/receipts';

declare global {
  interface Window {
    activeWrites: number;
    lastTripEvent: string;
  }
}

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ioAAAAASUVORK5CYII=';
function makeTrip(): Trip {
  return {
    ...TRADER_JOES,
    id: `sync-${crypto.randomUUID()}`,
    householdId: DEFAULT_HOUSEHOLD.id,
    payerId: 'p1', receiptImages: [photo], claims: {}, readyParticipantIds: [],
    status: 'claiming', createdAt: new Date().toISOString(),
  };
}

// Read actual SSE frames, including when frames are split across network chunks.
async function events(url: string) {
  const abort = new AbortController();
  const response = await fetch(url, { signal: abort.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    close: () => { abort.abort(); },
    async next() {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame.startsWith('data: ')) return JSON.parse(frame.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SSE ended before an update arrived');
        buffer += decoder.decode(value, { stream: true });
      }
    },
  };
}

test('photo-preserving saves keep originals and compact SSE sends photos only when changed', async ({ request, baseURL }) => {
  const trip = makeTrip();
  const url = `/api/trips/${trip.id}`;
  expect((await request.post('/api/trips', { data: trip })).ok()).toBeTruthy();
  const compact = await events(`${baseURL}${url}/events?compact=1`);
  const legacy = await events(`${baseURL}${url}/events`);
  try {
    expect((await compact.next()).receiptImages).toEqual([photo]);
    expect((await legacy.next()).receiptImages).toEqual([photo]);
    const response = await request.patch(`${url}?preservePhotos=1`, { data: { claims: { 'tj-1': { p2: 1 } } } });
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).not.toHaveProperty('receiptImages');
    const event = await compact.next();
    expect(event.claims['tj-1']).toEqual({ p2: 1 });
    expect(event).not.toHaveProperty('receiptImages');
    expect(event).not.toHaveProperty('receiptImagesOmitted');
    expect((await legacy.next()).receiptImages).toEqual([photo]);
    expect((await (await request.get(url)).json()).receiptImages).toEqual([photo]);

    // Legacy full writes with identical photo contents must also be compacted.
    await request.patch(url, { data: { receiptImages: [photo], readyParticipantIds: ['p2'] } });
    expect(await compact.next()).not.toHaveProperty('receiptImages');
    await legacy.next();

    const replacement = `${photo} `;
    await request.patch(url, { data: { receiptImages: [replacement] } });
    expect((await compact.next()).receiptImages).toEqual([replacement]);
    await legacy.next();
    await request.patch(url, { data: { receiptImages: [] } });
    expect((await compact.next()).receiptImages).toEqual([]);
    await legacy.next();
    expect((await (await request.get(url)).json()).receiptImages).toEqual([]);
  } finally {
    compact.close(); legacy.close();
  }
  // A reconnect receives the complete current state again, even after photos were removed.
  const reconnect = await events(`${baseURL}${url}/events?compact=1`);
  try { expect((await reconnect.next()).receiptImages).toEqual([]); }
  finally { reconnect.close(); }
});

test('preserving photos cannot create incomplete trips or save history summaries', async ({ request }) => {
  const trip = makeTrip();
  const url = `/api/trips/${trip.id}`;
  expect((await request.patch(`${url}?preservePhotos=1`, { data: { id: trip.id, claims: {} } })).status()).toBe(409);
  expect((await request.get(url)).status()).toBe(404);
  expect((await request.patch(`${url}?preservePhotos=1`, { data: trip })).status()).toBe(400);
  expect((await request.patch(`${url}?preservePhotos=1`, { data: { ...trip, receiptImagesOmitted: true } })).status()).toBe(400);
  // The existing full-trip upsert remains the recovery path.
  expect((await request.patch(url, { data: trip })).ok()).toBeTruthy();
  expect((await (await request.get(url)).json()).receiptImages).toEqual([photo]);
});

for (const recover of [false, true]) {
  test(`claim edits preserve photos in both browsers and local storage${recover ? ' after a retry' : ''}`, async ({ page, context, browser, request }) => {
    const trip = makeTrip();
    await request.post('/api/household', { data: DEFAULT_HOUSEHOLD });
    await request.post('/api/trips', { data: trip });
    const roommateContext = await browser.newContext();
    for (const client of [context, roommateContext]) await client.addInitScript((household) => {
      localStorage.setItem('grocery_splitter_household_init_v1', 'true');
      localStorage.setItem('grocery_splitter_household_v1', JSON.stringify(household));
      localStorage.setItem('grocery_splitter_active_participant_v1', 'p2');
    }, DEFAULT_HOUSEHOLD);
    await page.addInitScript(() => {
      const tracked = window;
      tracked.activeWrites = 0;
      tracked.lastTripEvent = '';
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'grocery_splitter_active_trip_v1') tracked.activeWrites++;
        return originalSet.call(this, key, value);
      };
      const OriginalEventSource = EventSource;
      window.EventSource = class extends OriginalEventSource {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          this.addEventListener('message', (event) => {
            tracked.lastTripEvent = JSON.parse(event.data).updatedAt;
          });
        }
      };
    });
    const roommate = await roommateContext.newPage();
    const streamReady = (tab: typeof page) => tab.waitForResponse((r) => r.url().includes('/events?compact=1'));
    await Promise.all([streamReady(page), streamReady(roommate), page.goto(`/?trip=${trip.id}`), roommate.goto(`/?trip=${trip.id}`)]);
    if (recover) {
      let rejected = false;
      await page.route(`**/api/trips/${trip.id}**`, (route) => {
        const url = new URL(route.request().url());
        if (!rejected && route.request().method() === 'PATCH' && url.searchParams.get('preservePhotos') === '1') {
          rejected = true;
          return route.fulfill({ status: 409, json: { error: 'Restore the trip' } });
        }
        return route.continue();
      });
    }
    await page.evaluate(() => { window.activeWrites = 0; });
    const saved = page.waitForResponse((r) => r.url().includes(`/api/trips/${trip.id}`) && r.request().method() === 'PATCH');
    const retry = recover ? page.waitForResponse((r) => r.url().endsWith(`/api/trips/${trip.id}`) && r.request().method() === 'PATCH') : null;
    await page.getByRole('button', { name: /^Claim:/ }).first().click();
    const response = await saved;
    expect(response.request().postDataJSON()).not.toHaveProperty('receiptImages');
    if (recover) expect(response.status()).toBe(409);
    const confirmed = retry ? await retry : response;
    if (retry) expect(confirmed.request().postDataJSON().receiptImages).toEqual([photo]);
    else expect(await confirmed.json()).not.toHaveProperty('receiptImages');
    const confirmedTrip = await confirmed.json();
    await expect.poll(() => page.evaluate(() => window.lastTripEvent)).toBe(confirmedTrip.updatedAt);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    // One optimistic write and at most one server correction; the SSE echo and
    // identical PATCH response must not each save the entire history again.
    await expect.poll(() => page.evaluate(() => window.activeWrites)).toBeGreaterThanOrEqual(1);
    const writes = await page.evaluate(() => window.activeWrites);
    expect(writes).toBeGreaterThanOrEqual(1);
    expect(writes).toBeLessThanOrEqual(2);
    await expect(roommate.getByRole('button', { name: /^Mine:/ }).first()).toBeVisible();
    for (const tab of [page, roommate]) {
      await expect.poll(() => readCachedTrip(tab).then((trip) => trip?.receiptImages)).toEqual([photo]);
      await expect(tab.getByText('Receipt photos (1)', { exact: true })).toBeVisible();
    }
    for (const tab of [page, roommate]) expect(await photoRecordCount(tab)).toBe(1);
    expect((await (await request.get(`/api/trips/${trip.id}`)).json()).receiptImages).toEqual([photo]);
    // A photo change from another client is delivered in full, then retained by
    // later compact edits. An explicit removal must clear both device caches.
    const replacement = `${photo}\n`;
    await request.patch(`/api/trips/${trip.id}`, { data: { receiptImages: [replacement] } });
    for (const tab of [page, roommate]) {
      await expect.poll(() => readCachedTrip(tab).then((trip) => trip?.receiptImages)).toEqual([replacement]);
    }
    const readySaved = page.waitForResponse((r) => r.url().includes('preservePhotos=1') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: /I'm done claiming/i }).click();
    expect(await (await readySaved).json()).not.toHaveProperty('receiptImages');
    await expect(roommate.getByText(/Alex is done/)).toBeVisible();
    for (const tab of [page, roommate]) {
      await expect.poll(() => readCachedTrip(tab).then((trip) => trip?.receiptImages)).toEqual([replacement]);
    }
    await request.patch(`/api/trips/${trip.id}`, { data: { receiptImages: [] } });
    for (const tab of [page, roommate]) {
      await expect.poll(() => readCachedTrip(tab).then((trip) => trip?.receiptImages)).toEqual([]);
    }
    await roommateContext.close();
  });
}

test('receipt images are only mounted while their gallery or viewer is open', async ({ page, context, request }) => {
  const trip = makeTrip();
  await request.post('/api/trips', { data: trip });
  await context.addInitScript(() => localStorage.setItem('grocery_splitter_active_participant_v1', 'p2'));
  await page.goto(`/?trip=${trip.id}`);
  const photos = page.getByRole('region', { name: 'Saved receipt photos' });
  await expect(photos.getByText('Receipt photos (1)', { exact: true })).toBeVisible();
  await expect(photos.locator('img')).toHaveCount(0);
  await photos.locator('summary').click();
  await expect(photos.locator('img')).toHaveCount(1);
  await photos.getByRole('button', { name: 'View receipt photo 1' }).click();
  const viewer = photos.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Close receipt photo' })).toBeFocused();
  await expect(viewer.locator('img')).toHaveAttribute('src', photo);
  await viewer.getByRole('button', { name: 'Actual size' }).click();
  await expect(viewer.getByRole('button', { name: 'Fit to width' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photos.locator('dialog img')).toHaveCount(0);
  await photos.getByRole('button', { name: 'View receipt photo 1' }).click();
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Close receipt photo' }).click();
  await expect(photos.locator('dialog img')).toHaveCount(0);
  await photos.locator('summary').click();
  await expect(photos.locator('img')).toHaveCount(0);
});

for (const state of ['current', 'missing', 'newer-local'] as const) {
  test(`reopening a ${state} cached trip uploads photos only when needed`, async ({ page, context, request }) => {
    let trip = makeTrip();
    if (state !== 'missing') trip = await (await request.post('/api/trips', { data: trip })).json();
    if (state === 'newer-local') trip = { ...trip, updatedAt: new Date(Date.now() + 60_000).toISOString(), storeName: 'Offline edit' };
    await context.addInitScript(({ trip, household }) => {
      localStorage.setItem('grocery_splitter_active_trip_v1', JSON.stringify(trip));
      localStorage.setItem('grocery_splitter_household_init_v1', 'true');
      localStorage.setItem('grocery_splitter_household_v1', JSON.stringify(household));
    }, { trip, household: DEFAULT_HOUSEHOLD });
    const uploads: Trip[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/trips' && req.method() === 'POST') uploads.push(req.postDataJSON());
    });
    const probe = await request.head(`/api/trips/${trip.id}`);
    expect(await probe.body()).toHaveLength(0);
    const checked = page.waitForResponse((r) => r.request().method() === 'HEAD');
    await page.goto('/');
    const head = await checked;
    expect(head.status()).toBe(state === 'missing' ? 404 : 200);
    await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
    if (state === 'current') expect(uploads).toHaveLength(0);
    else {
      expect(uploads).toHaveLength(1);
      expect(uploads[0].receiptImages).toEqual([photo]);
      const saved = await (await request.get(`/api/trips/${trip.id}`)).json();
      expect(saved.storeName).toBe(trip.storeName);
      expect(saved.receiptImages).toEqual([photo]);
    }
  });
}

test('large photos stay out of localStorage and remain available after an offline reload', async ({ page, context }) => {
  const trip = { ...makeTrip(), storeName: 'Large offline receipt', receiptImages: ['data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024)] };
  await context.addInitScript(() => {
    localStorage.setItem('grocery_splitter_active_participant_v1', 'p2');
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
  });
  await page.route('**/api/household', (route) => route.fulfill({ json: DEFAULT_HOUSEHOLD }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/trips?view=history&summary=1', (route) => route.fulfill({ json: [{ ...trip, receiptImages: [], receiptImagesOmitted: true }] }));
  await page.route(`**/api/trips/${trip.id}`, (route) => route.fulfill({ json: trip }));
  await page.route(`**/api/trips/${trip.id}/events?compact=1`, (route) => route.abort());
  await page.goto(`/?trip=${trip.id}`);
  await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
  await expect.poll(() => readCachedTrip(page).then((cached) => cached?.receiptImages[0].length)).toBe(trip.receiptImages[0].length);
  const metadata = await page.evaluate(() => ({
    active: localStorage.getItem('grocery_splitter_active_trip_v1')!,
    history: localStorage.getItem('grocery_splitter_trip_history_v1')!,
  }));
  expect(metadata.active.length).toBeLessThan(10_000);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('grocery_splitter_trip_history_v1')?.length ?? Infinity)).toBeLessThan(10_000);
  expect(await photoRecordCount(page)).toBe(1);
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
  await expect(page.getByText('Receipt photos (1)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
  await page.getByRole('button', { name: /^Large offline receipt/ }).click();
  await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
  expect((await readCachedTrip(page))?.receiptImages[0].length).toBe(trip.receiptImages[0].length);
});

test('an aborted IndexedDB migration preserves the embedded legacy cache', async ({ page, context, request }) => {
  const trip = await (await request.post('/api/trips', { data: makeTrip() })).json();
  await context.addInitScript((trip) => {
    localStorage.setItem('grocery_splitter_active_trip_v1', JSON.stringify(trip));
    localStorage.setItem('grocery_splitter_trip_history_v1', JSON.stringify([trip]));
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    };
  }, trip);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
  // Force a later task, so the aborted transactions and error handlers have run.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_active_trip_v1')!).receiptImages)).toEqual([photo]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_trip_history_v1')!)[0].receiptImages)).toEqual([photo]);
});

test('local claims remain optimistic and durable when the phone clock is behind the server', async ({ page, context, request }) => {
  const trip = await (await request.post('/api/trips', { data: makeTrip() })).json();
  await context.addInitScript(() => localStorage.setItem('grocery_splitter_active_participant_v1', 'p2'));
  await page.clock.setFixedTime(new Date(Date.now() - 5_000));
  await page.route(`**/api/trips/${trip.id}*`, (route) => route.request().method() === 'PATCH' ? route.abort() : route.continue());
  await page.goto(`/?trip=${trip.id}`);
  await expect(page.getByRole('heading', { name: trip.storeName, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Claim:/ }).first().click();
  await expect(page.getByRole('button', { name: /^Mine:/ })).toHaveCount(1);
  await page.getByRole('button', { name: /^Claim:/ }).first().click();
  await expect(page.getByRole('button', { name: /^Mine:/ })).toHaveCount(2);
  await expect.poll(() => readCachedTrip(page).then((cached) => Object.keys(cached?.claims ?? {}).length)).toBe(2);
  const cached = await readCachedTrip(page);
  expect(Date.parse(cached!.updatedAt!)).toBeGreaterThan(Date.parse(trip.updatedAt));
});

test('offline archiving advances past the cached revision when the phone clock is behind', async ({ page, context, request }) => {
  const trip = await (await request.post('/api/trips', { data: { ...makeTrip(), storeName: 'Clock skew archive regression' } })).json();
  await context.addInitScript(() => localStorage.setItem('grocery_splitter_active_participant_v1', 'p2'));
  await page.clock.setFixedTime(new Date(Date.now() - 5_000));
  await page.route(`**/api/trips/${trip.id}`, (route) => route.request().method() === 'POST' ? route.abort() : route.continue());
  await page.goto(`/?trip=${trip.id}`);
  await page.getByRole('button', { name: /View balances/ }).first().click();
  await page.getByRole('button', { name: 'Finish and archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
  const run = page.getByRole('button', { name: /^Clock skew archive regression Settled/ });
  await expect(run).toBeVisible();
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem('grocery_splitter_trip_history_v1') || '[]').find((trip: { id: string }) => trip.id === id)?.status, trip.id)).toBe('settled');
  const cached = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-splitter-cache', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ status: string; updatedAt: string }>((resolve, reject) => {
        const request = db.transaction('trips').objectStore('trips').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, trip.id);
  expect(cached.status).toBe('settled');
  expect(Date.parse(cached.updatedAt)).toBeGreaterThan(Date.parse(trip.updatedAt));
});
