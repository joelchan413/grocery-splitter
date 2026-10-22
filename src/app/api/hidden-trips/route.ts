import { NextRequest, NextResponse } from 'next/server';
import { getHiddenTripIds, setTripHidden } from '@/lib/server-db';

function errorResponse(err: unknown) {
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(getHiddenTripIds());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.tripId !== 'string' || !body.tripId || typeof body.hidden !== 'boolean') {
      return NextResponse.json({ error: 'Invalid hidden-trip payload' }, { status: 400 });
    }
    return NextResponse.json(setTripHidden(body.tripId, body.hidden));
  } catch (err) {
    return errorResponse(err);
  }
}
