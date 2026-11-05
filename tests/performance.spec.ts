import { test, expect } from '@playwright/test';
import { DEFAULT_HOUSEHOLD } from '../src/lib/storage';

test('returning households can use the app while history is still loading', async ({ page }) => {
  await page.addInitScript((household) => {
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
    localStorage.setItem('grocery_splitter_household_v1', JSON.stringify(household));
  }, DEFAULT_HOUSEHOLD);

  let releaseHistory!: () => void;
  const historyReady = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route('**/api/trips?view=history&summary=1', async (route) => {
    await historyReady;
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/household', (route) => route.fulfill({ json: DEFAULT_HOUSEHOLD }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: [] }));

  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();
    // A deferred dialog must also load and work before the history request completes.
    await page.getByRole('button', { name: /Apartment 4B/ }).click();
    await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible();
  } finally {
    releaseHistory();
  }
});

test('a startup refresh does not overwrite household edits made while it was loading', async ({ page }) => {
  await page.addInitScript((household) => {
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
    localStorage.setItem('grocery_splitter_household_v1', JSON.stringify(household));
  }, DEFAULT_HOUSEHOLD);
  let releaseHousehold!: () => void;
  const householdReady = new Promise<void>((resolve) => { releaseHousehold = resolve; });
  await page.route('**/api/household', async (route) => {
    if (route.request().method() === 'GET') {
      await householdReady;
      await route.fulfill({ json: DEFAULT_HOUSEHOLD });
    } else {
      await route.fulfill({ json: route.request().postDataJSON() });
    }
  });
  await page.route('**/api/trips?view=history&summary=1', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: [] }));

  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Apartment 4B/ }).click();
    await page.getByPlaceholder('e.g. Apartment 4B').fill('Updated household');
    await page.getByRole('button', { name: /Save/i }).click();
    await expect(page.getByRole('button', { name: /Updated household/ })).toBeVisible();
    const refreshFinished = page.waitForResponse((response) => response.url().endsWith('/api/household') && response.request().method() === 'GET');
    releaseHousehold();
    await (await refreshFinished).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_household_v1')!).name)).toBe('Updated household');
    await expect(page.getByRole('button', { name: /Updated household/ })).toBeVisible();
  } finally {
    releaseHousehold();
  }
});

test('large histories render in batches while every trip remains eligible for export', async ({ page, context }) => {
  const history = Array.from({ length: 350 }, (_, index) => ({
    id: `history-${index}`, householdId: DEFAULT_HOUSEHOLD.id,
    storeName: `History run ${index}`, date: '2026-01-01', createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    payerId: 'p1', status: 'claiming', items: [], claims: {}, taxTotal: 0, basketDiscount: 0,
    receiptImages: [], receiptImagesOmitted: true, readyParticipantIds: [],
  }));
  await context.addInitScript(() => localStorage.setItem('grocery_splitter_household_init_v1', 'true'));
  await page.route('**/api/household', (route) => route.fulfill({ json: DEFAULT_HOUSEHOLD }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/trips?view=history&summary=1', (route) => route.fulfill({ json: history }));
  await page.goto('/');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const selected = page.getByRole('checkbox', { name: /^Include History run/ });
  await expect(selected).toHaveCount(50);
  await page.getByRole('button', { name: 'Show more runs (300 remaining)' }).click();
  await expect(selected).toHaveCount(100);
  await expect(page.getByText('350 runs, newest first.', { exact: true })).toBeVisible();
  const historyCount = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_trip_history_v1')!).length);
  expect(historyCount).toBe(350);
});

test('a delayed startup refresh cannot undo a successful hide', async ({ page, context }) => {
  const trip = {
    id: 'hide-during-startup', householdId: DEFAULT_HOUSEHOLD.id, storeName: 'Hide regression', date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z', payerId: 'p1', status: 'claiming', items: [], claims: {}, taxTotal: 0,
    basketDiscount: 0, receiptImages: [], receiptImagesOmitted: true, readyParticipantIds: [],
  };
  await context.addInitScript(({ household, trip }) => {
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
    localStorage.setItem('grocery_splitter_household_v1', JSON.stringify(household));
    localStorage.setItem('grocery_splitter_trip_history_v1', JSON.stringify([trip]));
  }, { household: DEFAULT_HOUSEHOLD, trip });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/household', async (route) => { await ready; await route.fulfill({ json: DEFAULT_HOUSEHOLD }); });
  await page.route('**/api/trips?view=history&summary=1', (route) => route.fulfill({ json: [trip] }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: route.request().method() === 'POST' ? [trip.id] : [] }));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/hidden-trips') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Hide Hide regression on Jan 1', exact: true }).click();
    await saved;
    await expect(page.getByRole('button', { name: 'Hide Hide regression on Jan 1', exact: true })).toHaveCount(0);
    const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/household'));
    release();
    await (await refreshed).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_hidden_trips_v1')!))).toEqual([trip.id]);
    await expect(page.getByRole('button', { name: 'Hide Hide regression on Jan 1', exact: true })).toHaveCount(0);
  } finally { release(); }
});

test('a deferred screen chunk failure offers recovery after reconnecting', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('grocery_splitter_household_init_v1', 'true'));
  await page.route('**/api/household', (route) => route.fulfill({ json: DEFAULT_HOUSEHOLD }));
  await page.route('**/api/payments', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/hidden-trips', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/trips?view=history&summary=1', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();
  await page.route('**/_next/static/chunks/*.js', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'GrocerySplit couldn’t finish loading' })).toBeVisible();
  await page.unroute('**/_next/static/chunks/*.js');
  await page.getByRole('button', { name: 'Reload app', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();
});
