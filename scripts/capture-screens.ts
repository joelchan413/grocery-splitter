import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function runVisualAudit() {
  console.log('🚀 Capturing Light & Dark Mode Screenshots for UI Inspection...');

  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  
  for (const colorScheme of ['dark', 'light'] as const) {
    console.log(`\n🎨 Testing ${colorScheme.toUpperCase()} mode...`);
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme,
    });
    const page = await context.newPage();

    // 1. Scanner Screen
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 2. Load Sample Receipt & Review Screen
    await page.getByText(/Trader Joe's Run/i).click();
    await page.waitForTimeout(300);

    // 3. Open Claiming Board
    await page.getByRole('button', { name: /Open for Roommate Claims/i }).click();
    await page.waitForTimeout(300);
    
    // Joel claims item 1
    await page.getByRole('button', { name: /^Claim$/i }).first().click();

    // Switch to Alex & Join split
    await page.getByRole('button', { name: /Alex/i }).first().click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /Join Split/i }).first().click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // Switch to Sam
    await page.getByRole('button', { name: /Sam/i }).first().click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /Split All/i }).nth(1).click();
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // Switch to Jordan
    await page.getByRole('button', { name: /Jordan/i }).first().click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /I'm Done Claiming/i }).click();

    // 4. Settlement Breakdown View
    await page.getByRole('button', { name: /View Final Breakdown|View Balances/i }).first().click();
    await page.waitForTimeout(300);

    // Expand Joel's breakdown accordion to test drawer contrast!
    const expandButtons = page.locator('button[title="View item breakdown"]');
    await expandButtons.first().click();
    await page.waitForTimeout(200);

    // Hover over settings icon in header to test hover state!
    const settingsButton = page.getByLabel('Settings');
    await settingsButton.hover();
    await page.waitForTimeout(150);

    const screenshotPath = path.join(screenshotsDir, `settlement-expanded-${colorScheme}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 Captured ${screenshotPath}`);

    await context.close();
  }

  await browser.close();
  console.log('\n✨ Visual audit complete!');
}

runVisualAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
