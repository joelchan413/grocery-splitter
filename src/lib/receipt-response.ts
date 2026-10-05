import type { ParsedReceiptData } from './receipts';

export async function readReceiptResponse(response: Response): Promise<ParsedReceiptData> {
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    const message = response.status === 413 ? 'The receipt photos are too large. Please upload smaller images.'
      : `The server returned an unexpected response (HTTP ${response.status}). Please retry the scan.`;
    throw new Error(message);
  }
  if (!response.ok) throw new Error(data?.error || 'Failed to scan receipt image.');
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error('No receipt items were found. Please try a clearer photo.');
  }
  return data;
}
