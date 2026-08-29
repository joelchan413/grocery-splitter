import { NextRequest, NextResponse } from 'next/server';
import { getHousehold, updateHousehold } from '@/lib/server-db';

export async function GET() {
  try {
    const household = getHousehold();
    return NextResponse.json(household);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.name || !Array.isArray(body.participants)) {
      return NextResponse.json({ error: 'Invalid household payload' }, { status: 400 });
    }
    const updated = updateHousehold(body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
