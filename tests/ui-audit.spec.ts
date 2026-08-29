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
    await expect(page.getByText('Welcome! Set Up Your Household')).toBeVisible();
    await expect(page.getByText('Roommates (4)')).toBeVisible();

    // Complete Initial Setup Wizard
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();
    await expect(page.getByText('Scan Grocery Receipt')).toBeVisible();

    // Verify Household settings can be reopened anytime from Header
    await page.getByRole('button', { name: /Apartment 4B/i }).click();
    await expect(page.getByText('Household Setup')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();

    // Verify Settings Modal
    await page.getByLabel('Settings').click();
    await expect(page.getByText('Settings')).toBeVisible();
    await expect(page.getByText(/Recommended: Environment File/i)).toBeVisible();
    await page.getByRole('button', { name: /Close/i }).click();

    // 2. Select Sample Trader Joe's Receipt
    await page.getByText(/Trader Joe's Run/i).click();

    // 3. Verify Review Screen
    await expect(page.getByText('Verify Receipt Items')).toBeVisible();
    await expect(page.locator('input[value="Trader Joe\'s"]')).toBeVisible();
    await expect(page.getByText(/Line Items \(/i)).toBeVisible();

    // Toggle tax on an item
    const exemptBadge = page.getByRole('button', { name: /Exempt/i }).first();
    await exemptBadge.click();

    // Click "Open for Roommate Claims"
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();

    // 4. Claiming Board Flow
    await expect(page.getByText(/Select Who is Claiming/i)).toBeVisible();
    await expect(page.getByText(/Roommate Progress/i)).toBeVisible();

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
    await expect(page.getByText(/Alex: Ready ✓/i)).toBeVisible();

    // Switch to Sam
    await page.getByRole('button', { name: /Sam/i }).first().click();
    await page.getByRole('button', { name: /Split All/i }).nth(1).click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // Switch to Jordan
    await page.getByRole('button', { name: /Jordan/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // 5. Navigate to Settlement View
    await page.getByRole('button', { name: /View Final Breakdown|View Balances/i }).first().click();
    await expect(page.getByText(/Trip Settlement Breakdown/i)).toBeVisible();
    await expect(page.getByText(/Total to Reimburse/i)).toBeVisible();

    // Verify Venmo buttons exist for non-payer roommates
    const venmoButtons = page.getByRole('link', { name: /Venmo/i });
    expect(await venmoButtons.count()).toBeGreaterThanOrEqual(1);

    // Test Copy Summary
    await page.getByRole('button', { name: /Copy Summary for Group Chat/i }).click();
    await expect(page.getByText(/Copied to Clipboard!/i)).toBeVisible();

    // 6. Finish and Archive Trip
    await page.getByRole('button', { name: /Finish & Archive/i }).click();
    await expect(page.getByText(/Trip History Archive/i)).toBeVisible();
    await expect(page.getByText("Trader Joe's")).toBeVisible();

    // Click archived trip to inspect historical view
    await page.getByText("Trader Joe's").click();
    await expect(page.getByText(/Trip Settlement Breakdown/i)).toBeVisible();

    // Check console errors
    const fatalErrors = consoleErrors.filter(
      (err) => !err.includes('Download the React DevTools') && !err.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
