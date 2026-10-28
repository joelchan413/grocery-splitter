import { test, expect } from '@playwright/test';

test.describe('GrocerySplit Comprehensive End-to-End Test Suite', () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset household on server to default 4 roommates
    await request.post('/api/household', {
      data: {
        id: 'household-default',
        name: 'Apartment 4B',
        participants: [
          { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
          { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
          { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
          { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#DB2777', venmoHandle: '@jordan' },
        ],
      },
    });
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('1. Household setup & modal management: edit name, add roommate, edit details, and persist', async ({ page }) => {
    // Fresh load opens initial setup wizard
    await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roommates (4)' })).toBeVisible();

    // Change household name
    const householdNameInput = page.locator('input[placeholder="e.g. Apartment 4B"]');
    await householdNameInput.fill('Elm Street Loft');

    // Add a 5th roommate
    await page.getByRole('button', { name: /Add Roommate/i }).click();
    await expect(page.getByRole('heading', { name: 'Roommates (5)' })).toBeVisible();

    // Complete Initial Setup
    await page.getByRole('button', { name: /Save and start splitting/i }).click();
    await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();
    await expect(page.getByText('Elm Street Loft')).toBeVisible();
    await expect(page.getByText('5 roommates', { exact: true })).toBeVisible();

    // Reopen Household Modal from Header and verify values persisted
    await page.getByRole('button', { name: /Elm Street Loft/i }).click();
    await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible();
    await expect(householdNameInput).toHaveValue('Elm Street Loft');
    await expect(page.getByRole('heading', { name: 'Roommates (5)' })).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
  });

  test('2. Settings modal: Codex login status and refresh', async ({ page }) => {
    await page.route('**/api/scan-receipt', (route) => route.fulfill({ json: {
      installed: true, authenticated: true, model: 'Codex default', message: 'Ready to scan receipts.',
    } }));
    // Dismiss initial wizard with defaults
    await page.getByRole('button', { name: /Save and start splitting/i }).click();
    await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();

    // Open Settings
    await page.getByLabel('Settings').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await expect(page.getByText('Codex CLI', { exact: true })).toBeVisible();
    await expect(page.getByText('Ready to scan receipts.')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByText('Ready to scan receipts.')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  });

  test('3. Receipt review: editing items, tax flags, adding/deleting items, and recalculation', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save and start splitting/i }).click();

    // Select Sample Costco Receipt
    await page.getByText(/Costco Wholesale/i).click();

    // Verify Review Screen loaded with Costco data
    await expect(page.getByRole('heading', { name: 'Check receipt items' })).toBeVisible();
    const storeInput = page.locator('input[value="Costco Wholesale"]');
    await expect(storeInput).toBeVisible();

    // Modify store name
    await storeInput.fill('Costco Club');

    // Count line items (Costco sample has 6 items)
    await expect(page.getByRole('heading', { name: 'Items (6)' })).toBeVisible();

    // Add a new line item
    await page.getByRole('button', { name: /Add Item/i }).click();
    await expect(page.getByRole('heading', { name: 'Items (7)' })).toBeVisible();

    // Edit the new item's name and price
    const newItemInput = page.locator('input[value="New item"]');
    await expect(newItemInput).toBeVisible();
    await newItemInput.fill('Kirkland Sparkling Water');

    // Delete the first item
    const deleteButtons = page.locator('button[title="Remove item"]');
    await deleteButtons.first().click();
    await expect(page.getByRole('heading', { name: 'Items (6)' })).toBeVisible();

    // Toggle tax on an exempt item
    const exemptBadges = page.getByRole('button', { name: 'Not taxed', exact: true });
    await exemptBadges.first().click();
    await expect(page.getByRole('button', { name: 'Taxed', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');

    // Proceed to Claiming Board
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await expect(page.getByText(/Who's claiming\?/i)).toBeVisible();
    await expect(page.getByText('Costco Club')).toBeVisible();
  });

  test('4. Full collaborative claiming: individual claims, multi-roommate splits, and ready states', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save and start splitting/i }).click();

    // Select Trader Joe's Run
    await page.getByRole('button', { name: /Trader Joe's.*Open sample/i }).click();
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();

    // Joel claims Whole Milk
    await page.getByRole('button', { name: /^Claim$/i }).first().click();
    await expect(page.getByRole('button', { name: /^Mine$/i }).first()).toBeVisible();

    // Switch to Alex
    await page.getByRole('button', { name: /Alex/i }).first().click();

    // Alex joins split on Whole Milk
    await page.getByRole('button', { name: /Join Split/i }).first().click();
    await expect(page.getByText(/Split \(1\/2\)/i)).toBeVisible();

    // Alex claims Bananas alone
    await page.getByRole('button', { name: /^Claim$/i }).first().click();
    await expect(page.getByRole('button', { name: /^Mine$/i }).first()).toBeVisible();

    // Alex marks done
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Alex is done/i)).toBeVisible();

    // Switch to Sam
    await page.getByRole('button', { name: /Sam/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Sam is done/i)).toBeVisible();

    // Switch to Jordan
    await page.getByRole('button', { name: /Jordan/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Jordan is done/i)).toBeVisible();

    // Navigate to Settlement View
    await page.getByRole('button', { name: /View breakdown|View balances/i }).first().click();
    await expect(page.getByRole('heading', { name: "Trader Joe's", level: 1 })).toBeVisible();

    // Verify payer card shows Joel
    await expect(page.getByText('Joel paid the bill')).toBeVisible();
    await expect(page.getByText('Joel gets back')).toBeVisible();

    // Verify roommate cards exist with non-zero balances
    await expect(page.getByText(/Alex/i).first()).toBeVisible();
    await expect(page.getByText(/Sam/i).first()).toBeVisible();
    await expect(page.getByText(/Jordan/i).first()).toBeVisible();

    // Check Venmo buttons exist for owing participants
    const venmoLinks = page.getByRole('link', { name: /Venmo/i });
    expect(await venmoLinks.count()).toBeGreaterThanOrEqual(1);

    // Verify itemized drawer expands
    const expandButtons = page.getByRole('button', { name: /^Show items for/ });
    await expandButtons.first().click();
    await expect(page.getByRole('heading', { name: 'Own items' }).first()).toBeVisible();
    await expect(page.getByText(/of taxed items/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shared items, split 4 ways' }).first()).toBeVisible();
  });

  test('5. Multi-trip creation, archiving, and persistent Trip History archive navigation', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save and start splitting/i }).click();

    // 1. Scan and archive Trip 1: Trader Joe's
    await page.getByRole('button', { name: /Trader Joe's.*Open sample/i }).click();
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await page.getByRole('button', { name: /View breakdown|View balances/i }).first().click();
    await page.getByRole('button', { name: /Finish and archive/i }).click();

    // Land on Trip History Archive
    await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();

    // 2. Start a New Trip from Header
    await page.getByRole('button', { name: /New Trip/i }).click();
    await expect(page.getByRole('heading', { name: 'New grocery run' })).toBeVisible();

    // Scan Trip 2: Costco Wholesale
    await page.getByText(/Costco Wholesale/i).click();
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await page.getByRole('button', { name: /View breakdown|View balances/i }).first().click();
    await page.getByRole('button', { name: /Finish and archive/i }).click();

    // Land back on Trip History Archive
    await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();

    // Both Trader Joe's and Costco must be present in the history list!
    await expect(page.getByText("Costco Wholesale").first()).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();

    // Click Costco to inspect historical settlement breakdown
    await page.getByText("Costco Wholesale").first().click();
    await expect(page.getByRole('heading', { name: /Costco Wholesale/i, level: 1 })).toBeVisible();

    // Click "History" in header to return to Archive
    await page.getByRole('button', { name: /History/i }).click();
    await expect(page.getByRole('heading', { name: 'Trip history' })).toBeVisible();
    await expect(page.getByText("Costco Wholesale").first()).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();
  });
});
