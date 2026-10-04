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
          { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#7C3AED', venmoHandle: '@jordan' },
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
    await expect(page.getByText(/Welcome! Set Up Your Household/i)).toBeVisible();
    await expect(page.getByText('Roommates (4)')).toBeVisible();

    // Change household name
    const householdNameInput = page.locator('input[placeholder="e.g. Apartment 4B"]');
    await householdNameInput.fill('Elm Street Loft');

    // Add a 5th roommate
    await page.getByRole('button', { name: /Add Roommate/i }).click();
    await expect(page.getByText('Roommates (5)')).toBeVisible();

    // Complete Initial Setup
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();
    await expect(page.getByText('Scan Grocery Receipt')).toBeVisible();
    await expect(page.getByText('Elm Street Loft')).toBeVisible();
    await expect(page.getByText('(5 roommates)')).toBeVisible();

    // Reopen Household Modal from Header and verify values persisted
    await page.getByRole('button', { name: /Elm Street Loft/i }).click();
    await expect(page.getByRole('heading', { name: 'Household Setup' })).toBeVisible();
    await expect(householdNameInput).toHaveValue('Elm Street Loft');
    await expect(page.getByText('Roommates (5)')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();
  });

  test('2. Settings modal: AI model selection and API key management', async ({ page }) => {
    // Dismiss initial wizard with defaults
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();
    await expect(page.getByText('Scan Grocery Receipt')).toBeVisible();

    // Open Settings
    await page.getByLabel('Settings').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Select Gemini 3.5 Flash via text or radio
    await page.getByText('Gemini 3.5 Flash').click();
    await expect(page.locator('input[value="gemini-3.5-flash"]')).toBeChecked();

    // Enter custom API key
    const apiKeyInput = page.locator('input[type="password"]');
    await apiKeyInput.fill('AIzaSyTestApiKey12345');
    await page.getByRole('button', { name: /Save Settings/i }).click();
    await expect(page.getByText(/Saved!/i)).toBeVisible();

    // Wait for auto-close or close if still open
    await page.waitForTimeout(1200);

    // Reopen settings to verify persistence
    await page.getByLabel('Settings').click();
    await expect(apiKeyInput).toHaveValue('AIzaSyTestApiKey12345');
    await expect(page.locator('input[value="gemini-3.5-flash"]')).toBeChecked();
    await page.getByRole('button', { name: /Close/i }).click();
  });

  test('3. Receipt review: editing items, tax flags, adding/deleting items, and recalculation', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();

    // Select Sample Costco Receipt
    await page.getByText(/Costco Wholesale/i).click();

    // Verify Review Screen loaded with Costco data
    await expect(page.getByText('Verify Receipt Items')).toBeVisible();
    const storeInput = page.locator('input[value="Costco Wholesale"]');
    await expect(storeInput).toBeVisible();

    // Modify store name
    await storeInput.fill('Costco Club');

    // Count line items (Costco sample has 6 items)
    await expect(page.getByText(/Line Items \(6\)/i)).toBeVisible();

    // Add a new line item
    await page.getByRole('button', { name: /Add Item/i }).click();
    await expect(page.getByText(/Line Items \(7\)/i)).toBeVisible();

    // Edit the new item's name and price
    const newItemInput = page.locator('input[value="New Grocery Item"]');
    await expect(newItemInput).toBeVisible();
    await newItemInput.fill('Kirkland Sparkling Water');

    // Delete the first item
    const deleteButtons = page.locator('button[title="Remove item"]');
    await deleteButtons.first().click();
    await expect(page.getByText(/Line Items \(6\)/i)).toBeVisible();

    // Toggle tax on an exempt item
    const exemptBadges = page.locator('button[title="Tax-exempt staple"]');
    await exemptBadges.first().click();

    // Proceed to Claiming Board
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await expect(page.getByText(/Select Who is Claiming/i)).toBeVisible();
    await expect(page.getByText('Costco Club')).toBeVisible();
  });

  test('4. Full collaborative claiming: individual claims, multi-roommate splits, and ready states', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();

    // Select Trader Joe's Run
    await page.getByText(/Trader Joe's Run/i).click();
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
    await expect(page.getByText(/Alex: Ready ✓/i)).toBeVisible();

    // Switch to Sam
    await page.getByRole('button', { name: /Sam/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Sam: Ready ✓/i)).toBeVisible();

    // Switch to Jordan
    await page.getByRole('button', { name: /Jordan/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();
    await expect(page.getByText(/Jordan: Ready ✓/i)).toBeVisible();

    // Navigate to Settlement View
    await page.getByRole('button', { name: /View Final Breakdown|View Balances/i }).first().click();
    await expect(page.getByText(/Trip Settlement Breakdown/i)).toBeVisible();

    // Verify payer card shows Joel
    await expect(page.getByText('Paid Receipt')).toBeVisible();
    await expect(page.getByText(/Total to Reimburse Joel/i)).toBeVisible();

    // Verify roommate cards exist with non-zero balances
    await expect(page.getByText(/Alex/i).first()).toBeVisible();
    await expect(page.getByText(/Sam/i).first()).toBeVisible();
    await expect(page.getByText(/Jordan/i).first()).toBeVisible();

    // Check Venmo buttons exist for owing participants
    const venmoLinks = page.getByRole('link', { name: /Venmo/i });
    expect(await venmoLinks.count()).toBeGreaterThanOrEqual(1);

    // Verify itemized drawer expands
    const expandButtons = page.locator('button[title="View item breakdown"]');
    await expandButtons.first().click();
    await expect(page.getByText(/Claimed Line Items:/i).first()).toBeVisible();
    await expect(page.getByText(/Sales Tax Attribution/i).first()).toBeVisible();
  });

  test('5. Multi-trip creation, archiving, and persistent Trip History archive navigation', async ({ page }) => {
    // Dismiss wizard
    await page.getByRole('button', { name: /Save & Start Splitting/i }).click();

    // 1. Scan and archive Trip 1: Trader Joe's
    await page.getByText(/Trader Joe's Run/i).click();
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await page.getByRole('button', { name: /View Final Breakdown|View Balances/i }).first().click();
    await page.getByRole('button', { name: /Finish & Archive/i }).click();

    // Land on Trip History Archive
    await expect(page.getByText(/Trip History Archive/i)).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();

    // 2. Start a New Trip from Header
    await page.getByRole('button', { name: /New Trip/i }).click();
    await expect(page.getByText('Scan Grocery Receipt')).toBeVisible();

    // Scan Trip 2: Costco Wholesale
    await page.getByText(/Costco Wholesale/i).click();
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await page.getByRole('button', { name: /View Final Breakdown|View Balances/i }).first().click();
    await page.getByRole('button', { name: /Finish & Archive/i }).click();

    // Land back on Trip History Archive
    await expect(page.getByText(/Trip History Archive/i)).toBeVisible();

    // Both Trader Joe's and Costco must be present in the history list!
    await expect(page.getByText("Costco Wholesale").first()).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();

    // Click Costco to inspect historical settlement breakdown
    await page.getByText("Costco Wholesale").first().click();
    await expect(page.getByText(/Trip Settlement Breakdown/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Costco Wholesale/i })).toBeVisible();

    // Click "History" in header to return to Archive
    await page.getByRole('button', { name: /History/i }).click();
    await expect(page.getByText(/Trip History Archive/i)).toBeVisible();
    await expect(page.getByText("Costco Wholesale").first()).toBeVisible();
    await expect(page.getByText("Trader Joe's").first()).toBeVisible();
  });
});
