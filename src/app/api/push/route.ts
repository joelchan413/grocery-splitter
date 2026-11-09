import { NextRequest, NextResponse } from 'next/server';
import { getPushSubscriptions, removePushSubscriptions, savePushSubscription, UnknownRoommateError } from '@/lib/server-db';
import { isPushEndpoint, parseBrowserSubscription } from '@/lib/push-subscriptions';
import { vapidPublicKey } from '@/lib/notifications';

/** The key browsers subscribe with, or null when the server has no push keys set. Read at runtime, so the Docker image needs no rebuild. */
export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * `{ participantId, subscription }` subscribes this device for a roommate, or moves it to them.
 * `{ replaces, subscription }` comes from the service worker when the browser renews a subscription: it keeps the roommate.
 */
export async function POST(req: NextRequest) {
  try {
    if (!vapidPublicKey()) return NextResponse.json({ error: 'Push notifications are not set up on the server' }, { status: 503 });
    const body = await req.json().catch(() => null);
    const subscription = parseBrowserSubscription(body?.subscription);
    if (!subscription) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });

    let participantId: unknown = body?.participantId;
    if (participantId == null && isPushEndpoint(body?.replaces)) {
      participantId = getPushSubscriptions().find((s) => s.endpoint === body.replaces)?.participantId;
      if (participantId) removePushSubscriptions([body.replaces]);
    }
    if (typeof participantId !== 'string' || !participantId) {
      return NextResponse.json({ error: 'Choose who you are first' }, { status: 400 });
    }
    savePushSubscription({ ...subscription, participantId, createdAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnknownRoommateError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/** `{ endpoint }` stops notifications to this device. */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!isPushEndpoint(body?.endpoint)) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    removePushSubscriptions([body.endpoint]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
