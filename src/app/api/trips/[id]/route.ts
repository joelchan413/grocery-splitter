import { NextRequest, NextResponse } from 'next/server';
import { withoutReceiptImages } from '@/lib/trip-sync';
import { getTrip, updateTripPartial, archiveTrip, TripStatusError } from '@/lib/server-db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const trip = getTrip(id);
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    return NextResponse.json(trip);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unexpected server error') }, { status: 500 });
  }
}

// Returning devices only need a version check before deciding whether to upload
// their cached trip. Avoid reading photo bytes into an HTTP response for this.
export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const trip = getTrip(id);
    if (!trip) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: {
        'X-Trip-Updated-At': trip.updatedAt || trip.createdAt || trip.date || '',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();
    if (updates.receiptImagesOmitted) {
      return NextResponse.json({ error: 'Load the complete trip before saving' }, { status: 400 });
    }
    const preservePhotos = req.nextUrl.searchParams.get('preservePhotos') === '1';
    if (preservePhotos) {
      if (Object.hasOwn(updates, 'receiptImages')) {
        return NextResponse.json({ error: 'A photo-preserving update must omit receiptImages' }, { status: 400 });
      }
      if (!getTrip(id)) {
        return NextResponse.json({ error: 'Upload the complete trip to restore its photos' }, { status: 409 });
      }
    }
    const updated = updateTripPartial(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    return NextResponse.json(preservePhotos ? withoutReceiptImages(updated) : updated);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unexpected server error') }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body.action === 'archive') {
      const archived = archiveTrip(id);
      return NextResponse.json(archived);
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof TripStatusError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unexpected server error') }, { status: 500 });
  }
}
