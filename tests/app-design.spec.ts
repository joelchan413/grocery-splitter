import { test, expect, type Page } from '@playwright/test';
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

const receiptPhoto = {
  name: 'receipt.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
};

async function expectNoSideways(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('a new run keeps the chosen payer and photo through scanning, and offers the photo for download', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New grocery run', level: 1 })).toBeVisible();
  await expect(page.getByText('No runs yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^Alex/ }).click();
  await expect(page.getByRole('button', { name: /Alex Paid the bill/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(receiptPhoto);
  await expect(page.getByAltText('Receipt photo 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scan receipt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check receipt items' })).toBeVisible();
  await expect(page.getByLabel('Paid by')).toHaveValue('p2');
  await page.getByText('Receipt photos (1)', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download receipt photo 1' }).first()).toHaveAttribute('download', /\.png$/);
});

test('the last run lists what each roommate owes, and reopens the trip', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Jordan/ }).click();
  await page.getByRole('button', { name: /Trader Joe's.*Open sample/ }).click();
  await page.getByRole('button', { name: 'Open for roommate claims' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /New trip/ }).click();

  const lastRun = page.getByRole('region', { name: 'Last run' });
  await expect(lastRun.getByRole('button', { name: /Trader Joe's .*Jordan paid \$56\.50 Claiming/ })).toBeVisible();
  await expect(lastRun.getByRole('listitem').filter({ hasText: 'Jordan' })).toContainText('Gets back+$42.39');
  await expect(lastRun.getByText('$14.13', { exact: true })).toHaveCount(3);
  await expect(page.getByText('1 earlier run is still open for claims.')).toBeVisible();
  await lastRun.getByRole('button', { name: /Trader Joe's/ }).click();
  await expect(page.getByRole('button', { name: 'View balances', exact: true })).toBeVisible();
});

test('the payer sees their own share, and the shares add up to the bill', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Trader Joe's.*Open sample/ }).click();
  await page.getByRole('button', { name: 'Open for roommate claims' }).click();
  await expect(page.getByText("Joel's own share")).toBeVisible();
  // $56.50 split four ways: three roommates pay $14.13 each, and the payer keeps the remaining $14.11.
  await expect(page.getByText('$14.11 paid the bill')).toBeVisible();
  await page.getByRole('button', { name: 'View breakdown' }).click();
  await expect(page.getByRole('heading', { name: "Trader Joe's", level: 1 })).toBeVisible();
  await expect(page.getByText('Balances for the', { exact: false })).toContainText('total $56.50');
  await expect(page.getByText('+$42.39', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Venmo: Alex pays Joel \$14\.13$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show items for Alex' }).click();
  await expect(page.getByRole('button', { name: 'Hide items for Alex' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Shared items, split 4 ways' })).toBeVisible();
  // The payer's breakdown explains the two cents the roommates' rounded payments leave behind.
  await page.getByRole('button', { name: 'Show items for Joel' }).click();
  await expect(page.locator('#settlement-items-p1')).toContainText('Adjustment');
  await expect(page.locator('#settlement-items-p1')).toContainText('-$0.02');
});

test('roommates keep their own colour on every screen', async ({ page }) => {
  await page.goto('/');
  const joel = page.locator('.scan-person').first().locator('.avatar');
  await expect(joel).toHaveText('J');
  await expect(joel).toHaveAttribute('style', /--person:\s*#2563EB/i);
  const background = await joel.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  await page.getByRole('button', { name: /Trader Joe's.*Open sample/ }).click();
  await page.getByRole('button', { name: 'Open for roommate claims' }).click();
  await expect(page.locator('.avatar').filter({ hasText: 'A' }).first()).toHaveAttribute('style', /--person:\s*#059669/i);
  // No emoji avatars remain in the interface.
  expect(await page.locator('main').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
});

test('dialogs are labelled, keep focus inside, close with Escape, and history rows work from the keyboard', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: /Apartment 4B/ });
  await opener.click();
  const household = page.getByRole('dialog', { name: 'Household' });
  await expect(household).toBeVisible();
  const focusInsideHousehold = () => household.evaluate(dialog => dialog.contains(document.activeElement));
  expect(await focusInsideHousehold()).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await focusInsideHousehold()).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await focusInsideHousehold()).toBe(true);
  // Clicking plain text focuses the dialog itself; Shift+Tab from there must stay inside too.
  await household.getByRole('heading', { name: 'Household' }).click();
  await page.keyboard.press('Shift+Tab');
  expect(await focusInsideHousehold()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(household).toBeHidden();
  await expect(opener).toBeFocused();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();

  await page.getByRole('button', { name: /Costco Wholesale.*Open sample/ }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
  const row = page.getByRole('button', { name: /Costco Wholesale/ });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Check receipt items' })).toBeVisible();
});

test('every screen fits phone, tablet and desktop, and the sidebar folds below 1101px', async ({ page }) => {
  await page.goto('/');
  const screens: [string, () => Promise<void>][] = [
    ['new run', async () => {}],
    ['review', async () => { await page.getByRole('button', { name: /Costco Wholesale.*Open sample/ }).click(); }],
    ['claiming', async () => { await page.getByRole('button', { name: 'Open for roommate claims' }).click(); }],
    ['settlement', async () => { await page.getByRole('button', { name: 'View breakdown' }).click(); }],
    ['history', async () => { await page.getByRole('button', { name: 'History' }).click(); }],
  ];
  for (const [, open] of screens) {
    await open();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoSideways(page);
      const heading = page.getByRole('heading', { level: 1 });
      expect(await heading.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeLessThanOrEqual(2.1);
      const header = await page.locator('.app-header').boundingBox();
      if (width >= 1101) expect(header?.width).toBe(240);
      else expect(header?.width).toBe(width);
    }
  }
});

test('the share dialog draws its QR code locally and never sends the trip link elsewhere', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) outside.push(url.hostname);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Trader Joe's.*Open sample/ }).click();
  await page.getByRole('button', { name: 'Open for roommate claims' }).click();
  await page.getByRole('button', { name: 'Share live trip' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this trip' });
  const qr = dialog.getByRole('img', { name: 'QR code that opens this trip' });
  await expect(qr).toBeVisible();
  expect(await qr.locator('path').getAttribute('d')).toMatch(/^M\d/);
  await expect(dialog.getByLabel('Trip link')).toHaveValue(/\/\?trip=trip-\d+$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(outside).toEqual([]);
});
