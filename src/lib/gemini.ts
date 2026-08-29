import { LineItem } from '@/types';

export interface ParsedReceiptData {
  storeName: string;
  date: string;
  items: LineItem[];
  taxTotal: number;
  basketDiscount: number;
  receiptTotal: number;
}

export const SAMPLE_RECEIPTS: { id: string; label: string; data: ParsedReceiptData }[] = [
  {
    id: 'sample-trader-joes',
    label: "🛒 Trader Joe's Run ($58.45)",
    data: {
      storeName: "Trader Joe's",
      date: new Date().toISOString().split('T')[0],
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
      date: new Date().toISOString().split('T')[0],
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

/**
 * Extracts line items from 1 or more receipt images using Gemini Flash multimodal API.
 */
export async function parseReceiptImages(
  imageBase64List: string[],
  customApiKey?: string
): Promise<ParsedReceiptData> {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. You can enter an API key in Settings or use the Demo Sample Receipts.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `You are an expert grocery receipt OCR parser. Analyze the provided grocery receipt image(s).
Extract all line items, their individual unit prices, quantities, total line cost, line discounts, sales tax, basket discounts, and whether each item is subject to sales tax in US grocery rules.

General US Grocery Tax Rules:
- Basic unprocessed grocery foods (milk, bread, fresh produce, meat, eggs, cereal) are NON-TAXABLE (isTaxable = false).
- Prepared/hot foods, alcoholic drinks, confections/candy, soda, paper products, cleaning supplies, toiletries, and non-food general merchandise are TAXABLE (isTaxable = true). If the receipt has a tax code (like 'T', 'TX', 'Y', 'F' for food stamp/exempt), use the receipt's explicit indicator.

Return valid JSON adhering strictly to this schema:
{
  "storeName": "Name of grocery store (e.g. Trader Joe's, Safeway, Whole Foods, Kroger, etc.)",
  "date": "YYYY-MM-DD (or today's date if missing)",
  "items": [
    {
      "name": "Clean readable item name (expand cryptic abbreviations if obvious, e.g. 'ORG WHL MILK' -> 'Organic Whole Milk')",
      "quantity": 1,
      "unitPrice": 4.99,
      "totalPrice": 4.99,
      "isTaxable": false,
      "lineDiscount": 0
    }
  ],
  "taxTotal": 1.25,
  "basketDiscount": 0,
  "receiptTotal": 45.50
}`,
        },
        ...imageBase64List.map((base64) => {
          // Remove prefix if present
          const cleanBase64 = base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
          return {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/jpeg',
            },
          };
        }),
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3.7-flash',
    contents: contents as any,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text || '{}';
  const parsed = JSON.parse(text);

  return {
    storeName: parsed.storeName || 'Grocery Store',
    date: parsed.date || new Date().toISOString().split('T')[0],
    items: (parsed.items || []).map((it: any, idx: number) => ({
      id: `item-${Date.now()}-${idx + 1}`,
      name: it.name || `Item ${idx + 1}`,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || Number(it.totalPrice) || 0,
      totalPrice: Number(it.totalPrice) || ((Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)),
      isTaxable: Boolean(it.isTaxable),
      lineDiscount: Number(it.lineDiscount) || 0,
    })),
    taxTotal: Number(parsed.taxTotal) || 0,
    basketDiscount: Number(parsed.basketDiscount) || 0,
    receiptTotal: Number(parsed.receiptTotal) || 0,
  };
}
