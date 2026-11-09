import { NextRequest, NextResponse } from 'next/server';
import { getPushSubscriptions, removePushSubscriptions, savePushSubscription, UnknownRoommateError } from '@/lib/server-db';
import { isPushEndpoint, parseBrowserSubscription } from '@/lib/push-subscriptions';
import { vapidPublicKey } from '@/lib/notifications';

function errorResponse(err: unknown) {
  if (err instanceof UnknownRoommateError) return NextResponse.json({ error: err.message }, { status: 400 });
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

/**
 * The key browsers subscribe with, or null when the server has no push keys set. Read at runtime, so the Docker image needs no rebuild.
 * With `?endpoint=`, also whose notifications that device gets, so a phone that lost its local storage still shows the right roommate.
 */
export async function GET(req: NextRequest) {
  try {
    const endpoint = req.nextUrl.searchParams.get('endpoint');
    const participantId = endpoint ? getPushSubscriptions().find((s) => s.endpoint === endpoint)?.participantId ?? null : undefined;
    return NextResponse.json({ publicKey: vapidPublicKey(), participantId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
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

    const replaces = isPushEndpoint(body?.replaces) && body.replaces !== subscription.endpoint ? body.replaces : null;
    const participantId: unknown = body?.participantId ?? (replaces && getPushSubscriptions().find((s) => s.endpoint === replaces)?.participantId);
    if (typeof participantId !== 'string' || !participantId) {
      return NextResponse.json({ error: 'Choose who you are first' }, { status: 400 });
    }
    savePushSubscription({ ...subscription, participantId, createdAt: new Date().toISOString() });
    // Only once the new subscription is saved, so a refused one never costs the device its old record.
    if (replaces) removePushSubscriptions([replaces]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
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
    return errorResponse(err);
  }
}
