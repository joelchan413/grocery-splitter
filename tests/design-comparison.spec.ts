import { test, expect } from '@playwright/test';
import { DEFAULT_HOUSEHOLD } from '../src/lib/storage';
import { SAMPLE_RECEIPTS } from '../src/lib/receipts';
import type { Trip } from '../src/types';

// All API traffic is mocked so this suite never writes to the local or deployed database.
test.beforeEach(async ({ page }) => {
  const trips = new Map<string, Trip>();
  await page.addInitScript(() => {
    localStorage.setItem('grocery_splitter_household_init_v1', 'true');
    localStorage.setItem('grocery_splitter_active_participant_v1', 'p1');
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/household') return route.fulfill({ json: DEFAULT_HOUSEHOLD });
    if (url.pathname === '/api/scan-receipt') return route.fulfill({ json: SAMPLE_RECEIPTS[0].data });
    if (url.pathname.endsWith('/events')) {
      return route.fulfill({ contentType: 'text/event-stream', body: ': connected\n\n' });
    }
    if (request.method() === 'POST' || request.method() === 'PATCH') {
      const trip = request.postDataJSON() as Trip;
      trips.set(trip.id, trip);
      return route.fulfill({ json: trip });
    }
    if (url.searchParams.get('view') === 'history') return route.fulfill({ json: [...trips.values()] });
    return route.fulfill({ json: null });
  });
});

test('switching designs preserves payer and uploaded photos, and scans the same trip', async ({ page }) => {
  await page.goto('/?design=anthropic');
  await page.getByRole('button', { name: /Alex/ }).click();
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({
    name: 'receipt.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByAltText('Receipt photo 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Taste v2/ }).click();
  await expect(page.getByRole('heading', { name: 'Split the grocery run.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alex Paid the bill/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByAltText('Receipt photo 1', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/design=taste/);
  await page.getByRole('button', { name: 'Scan receipt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Receipt Items' })).toBeVisible();
  await expect(page.getByLabel('Payer selection')).toHaveValue('p2');
  await page.getByText('Receipt photos (1)', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download receipt photo 1' }).first()).toHaveAttribute('download', /\.png$/);
});

test('switching preserves unsaved review edits, claims, and the settlement view', async ({ page }) => {
  await page.goto('/?design=anthropic');
  await page.getByRole('button', { name: /Costco Wholesale.*Open sample/ }).click();
  const store = page.locator('input[type="text"]').first();
  await store.fill('Shared grocery run');
  await page.getByRole('button', { name: /Taste v2/ }).click();
  await expect(store).toHaveValue('Shared grocery run');
  await page.getByRole('button', { name: 'Open for Roommate Claims' }).click();
  await page.getByRole('button', { name: 'Claim', exact: true }).first().click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_active_trip_v1') || '{}').claims);
  expect(Object.keys(before).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: /Anthropic/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grocery_splitter_active_trip_v1') || '{}').claims)).toEqual(before);
  await page.getByRole('button', { name: 'View Balances', exact: true }).click();
  await expect(page.getByText('Trip Settlement Breakdown', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Taste v2/ }).click();
  await expect(page.getByText('Trip Settlement Breakdown', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shared grocery run' })).toBeVisible();
});

test('design choice survives reload and both layouts fit phone, tablet, and desktop', async ({ page }) => {
  await page.goto('/?design=anthropic');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [/Anthropic/, /Taste v2/]) {
      await page.getByRole('button', { name }).click();
      await expect(page.locator('.app-shell')).toHaveAttribute('data-color-scheme', name.source === 'Anthropic' ? 'light' : 'dark');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const heading = page.getByRole('heading', { level: 1 });
      expect(await heading.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeLessThanOrEqual(2.1);
    }
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Taste v2/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Split the grocery run.' })).toBeVisible();
});
