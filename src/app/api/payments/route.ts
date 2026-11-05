import { NextRequest, NextResponse } from 'next/server';
import { clearPayments, getPaidShares, recordPayments, UnknownShareError } from '@/lib/server-db';
import { isShareRefList, isSharePaymentList } from '@/lib/payments';

function errorResponse(err: unknown) {
  if (err instanceof UnknownShareError) return NextResponse.json({ error: err.message }, { status: 400 });
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(getPaidShares());
  } catch (err) {
    return errorResponse(err);
  }
}

/** `{ paid: true, shares: [{ tripId, participantId, cents }] }` records payments; `{ paid: false, shares: [{ tripId, participantId }] }` clears them. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (body?.paid === true && isSharePaymentList(body.shares)) {
      return NextResponse.json(recordPayments(body.shares));
    }
    if (body?.paid === false && isShareRefList(body.shares)) {
      return NextResponse.json(clearPayments(body.shares));
    }
    return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
