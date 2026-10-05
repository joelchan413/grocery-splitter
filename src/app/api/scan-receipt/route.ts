import { NextRequest, NextResponse } from 'next/server';
import { getCodexStatus, parseReceiptImages, ReceiptScanError } from '@/lib/codex';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await getCodexStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const maxBytes = 34 * 1024 * 1024;
    if (Number(req.headers.get('content-length')) > maxBytes) {
      throw new ReceiptScanError('The receipt photos are too large. Please upload smaller images.', 413, 'REQUEST_TOO_LARGE');
    }
    if (!req.body) throw new ReceiptScanError('Receipt photos are required.', 400, 'INVALID_REQUEST');
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new ReceiptScanError('The receipt photos are too large. Please upload smaller images.', 413, 'REQUEST_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ReceiptScanError('The receipt upload was not valid JSON.', 400, 'INVALID_REQUEST'); }
    const parsedData = await parseReceiptImages(body?.images);
    return NextResponse.json(parsedData);
  } catch (error: unknown) {
    const known = error instanceof ReceiptScanError;
    console.error('Receipt scan failed:', known ? error.code : 'INTERNAL_ERROR');
    return NextResponse.json(
      { error: known ? error.message : 'Failed to scan receipt image. Please retry.' },
      { status: known ? error.status : 500 }
    );
  }
}
