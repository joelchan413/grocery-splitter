import type { Page } from '@playwright/test';
import type { ParsedReceiptData } from '../../src/lib/receipts';

const today = new Date().toISOString().split('T')[0];

export const RECEIPTS: { id: string; label: string; data: ParsedReceiptData }[] = [
  {
    id: 'sample-trader-joes',
    label: "🛒 Trader Joe's Run ($58.45)",
    data: {
      storeName: "Trader Joe's",
      date: today,
      items: [
        { id: 'tj-1', name: 'Organic Whole Milk (Gallon)', quantity: 1, unitPrice: 4.49, totalPrice: 4.49, isTaxable: false },
        { id: 'tj-2', name: 'Organic Bananas (Bunch)', quantity: 1, unitPrice: 1.99, totalPrice: 1.99, isTaxable: false },
        { id: 'tj-3', name: 'Avocados Bag (4ct)', quantity: 4, unitPrice: 1.25, totalPrice: 5.00, isTaxable: false },
        { id: 'tj-4', name: 'Sourdough Bread Loaf', quantity: 1, unitPrice: 3.99, totalPrice: 3.99, isTaxable: false },
        { id: 'tj-5', name: 'Cold Brew Coffee Concentrate', quantity: 2, unitPrice: 7.99, totalPrice: 15.98, isTaxable: false },
        { id: 'tj-6', name: 'Greek Honey Yogurt (32oz)', quantity: 1, unitPrice: 5.49, totalPrice: 5.49, isTaxable: false },
        { id: 'tj-7', name: 'Dark Chocolate Peanut Butter Cups', quantity: 2, unitPrice: 4.49, totalPrice: 8.98, isTaxable: true },
        { id: 'tj-8', name: 'Citrus Scent Dish Soap', quantity: 1, unitPrice: 3.99, totalPrice: 3.99, isTaxable: true },
        { id: 'tj-9', name: 'Recycled Paper Towels (2pk)', quantity: 1, unitPrice: 4.99, totalPrice: 4.99, isTaxable: true },
      ],
      taxTotal: 1.60, // Tax on candy, soap, paper towels
      basketDiscount: 0,
      receiptTotal: 58.45,
    },
  },
  {
    id: 'sample-costco',
    label: '📦 Costco Wholesale Haul ($142.80)',
    data: {
      storeName: 'Costco Wholesale',
      date: today,
      items: [
        { id: 'co-1', name: 'Kirkland Eggs (5 Dozen)', quantity: 1, unitPrice: 12.99, totalPrice: 12.99, isTaxable: false },
        { id: 'co-2', name: 'Kirkland Olive Oil (2L)', quantity: 1, unitPrice: 21.99, totalPrice: 21.99, isTaxable: false },
        { id: 'co-3', name: 'Organic Chicken Breast (6pk)', quantity: 1, unitPrice: 28.50, totalPrice: 28.50, isTaxable: false },
        { id: 'co-4', name: 'Kirkland Bath Tissue (30pk)', quantity: 1, unitPrice: 22.99, totalPrice: 22.99, isTaxable: true },
        { id: 'co-5', name: 'Tide Pods Laundry Detergent', quantity: 1, unitPrice: 29.99, totalPrice: 29.99, isTaxable: true, lineDiscount: 5.00 },
        { id: 'co-6', name: 'Protein Bars Variety (20ct)', quantity: 2, unitPrice: 14.00, totalPrice: 28.00, isTaxable: true },
      ],
      taxTotal: 6.84,
      basketDiscount: 10.00, // Instant savings coupon
      receiptTotal: 142.80,
    },
  },
];

export const TRADER_JOES = RECEIPTS[0].data;
export const COSTCO = RECEIPTS[1].data;

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** Adds a dummy photo and mocks the scan API so the given receipt opens in review. */
export async function scanReceipt(page: Page, receipt: ParsedReceiptData) {
  await page.route('**/api/scan-receipt', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ json: receipt }) : route.fallback()
  );
  await page.getByLabel('Receipt photos').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: /^Scan receipt/ }).click();
}
