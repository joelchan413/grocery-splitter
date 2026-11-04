import { test, expect } from '@playwright/test';

test.describe('GrocerySplit Complete User Flow and UI Audit', () => {
  test('full end-to-end receipt scanning, review, claiming, settlement, and archiving', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Visit homepage (First-time setup wizard opens automatically on fresh load)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roommates (4)' })).toBeVisible();

    // Complete Initial Setup Wizard
    await page.getByRole('button', { name: /Save and start splitting/i }).click();
    await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();

    // Verify Household settings can be reopened anytime from Header
    await page.getByRole('button', { name: /Apartment 4B/i }).click();
    await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();

    await page.route('**/api/scan-receipt', (route) => route.fulfill({ json: {
      installed: true, authenticated: true, model: 'Codex default', message: 'Ready to scan receipts.',
    } }));
    // Verify receipt scanner settings
    await page.getByLabel('Settings').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Codex CLI', { exact: true })).toBeVisible();
    await expect(page.getByText('Ready to scan receipts.')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // 2. Select Sample Trader Joe's Receipt
    await page.getByRole('button', { name: /Trader Joe's.*Open sample/i }).click();

    // 3. Verify Review Screen
    await expect(page.getByRole('heading', { name: 'Check receipt items' })).toBeVisible();
    await expect(page.locator('input[value="Trader Joe\'s"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Items \(\d+\)$/ })).toBeVisible();

    // Toggle tax on an item
    const exemptBadge = page.getByRole('button', { name: 'Not taxed', exact: true }).first();
    await exemptBadge.click();

    // Click "Open for Roommate Claims"
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();

    // 4. Claiming Board Flow
    await expect(page.getByText(/Who's claiming\?/i)).toBeVisible();
    await expect(page.getByText('Done claiming', { exact: true })).toBeVisible();

    // Verify Share Live Modal
    await page.getByRole('button', { name: /Share Live/i }).click();
    await expect(page.getByRole('heading', { name: 'Share this trip' })).toBeVisible();
    await expect(page.getByLabel('Trip link')).toHaveValue(/\?trip=/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Joel (Active by default) claims first item
    await page.getByRole('button', { name: /^Claim$/i }).first().click();
    await expect(page.getByRole('button', { name: /^Mine$/i }).first()).toBeVisible();

    // Switch to Alex
    await page.getByRole('button', { name: /Alex/i }).first().click();
    
    // Alex joins split on the same item that Joel claimed
    await page.getByRole('button', { name: /Join Split/i }).first().click();
    // Verify that the button now shows split indicator
    await expect(page.getByText(/Split \(1\/2\)/i)).toBeVisible();
    // Verify that the claimed badge row reflects split price
    await expect(page.locator('span').filter({ hasText: /^Joel$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Alex$/ })).toBeVisible();

    // Alex marks done
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Alex is done/i)).toBeVisible();

    // Switch to Sam
    await page.getByRole('button', { name: /Sam/i }).first().click();
    await page.getByRole('button', { name: /Split All/i }).nth(1).click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // Switch to Jordan
    await page.getByRole('button', { name: /Jordan/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // 5. Navigate to Settlement View
    await page.getByRole('button', { name: /View breakdown|View balances/i }).first().click();
    await expect(page.getByRole('heading', { name: "Trader Joe's", level: 1 })).toBeVisible();
    await expect(page.getByText(/gets back/i)).toBeVisible();

    // Verify Venmo buttons exist for non-payer roommates
    const venmoButtons = page.getByRole('link', { name: /Venmo/i });
    expect(await venmoButtons.count()).toBeGreaterThanOrEqual(1);

    // Test Copy Summary
    await page.getByRole('button', { name: /Copy summary for the group chat/i }).click();
    await expect(page.getByText('Summary copied')).toBeVisible();

    // 6. Finish and Archive Trip
    await page.getByRole('button', { name: /Finish and archive/i }).click();
    await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();

    // Click archived trip to inspect historical view
    await page.getByText("Trader Joe's").first().click();
    await expect(page.getByRole('heading', { name: "Trader Joe's", level: 1 })).toBeVisible();

    // Check console errors
    const fatalErrors = consoleErrors.filter(
      (err) => !err.includes('Download the React DevTools') && !err.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
