import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptImages } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images, apiKey } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'At least one receipt image is required.' },
        { status: 400 }
      );
    }

    const parsedData = await parseReceiptImages(images, apiKey);
    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error('Error scanning receipt:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to scan receipt image.' },
      { status: 500 }
    );
  }
}
