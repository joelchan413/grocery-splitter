import { summarizeTrip } from '@/lib/trip-history';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveTrip, getTripHistory, saveTrip } from '@/lib/server-db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view');

    if (view === 'history') {
      const history = getTripHistory();
      return NextResponse.json(searchParams.get('summary') === '1' ? history.map(summarizeTrip) : history);
    }

    const activeTrip = getActiveTrip();
    return NextResponse.json({ activeTrip });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unexpected server error') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const trip = await req.json();
    if (!trip || trip.receiptImagesOmitted || !trip.id || !Array.isArray(trip.items)) {
      return NextResponse.json({ error: 'Invalid trip payload' }, { status: 400 });
    }
    const saved = saveTrip(trip);
    return NextResponse.json(saved);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unexpected server error') }, { status: 500 });
  }
}
