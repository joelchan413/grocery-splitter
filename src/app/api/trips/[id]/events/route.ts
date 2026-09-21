import { NextRequest } from 'next/server';
import { getTrip, tripEvents } from '@/lib/server-db';
import { Trip } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  const initialTrip = getTrip(tripId);

  const encoder = new TextEncoder();
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let onTripUpdate: ((updatedTrip: Trip) => void) | null = null;

  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (onTripUpdate) {
      tripEvents.off(`trip-updated:${tripId}`, onTripUpdate);
      onTripUpdate = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial state immediately
      if (initialTrip) {
        const payload = `data: ${JSON.stringify(initialTrip)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      // 2. Listen for real-time updates to this specific trip
      onTripUpdate = (updatedTrip: Trip) => {
        try {
          const payload = `data: ${JSON.stringify(updatedTrip)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error('Error sending SSE message:', err);
        }
      };

      tripEvents.on(`trip-updated:${tripId}`, onTripUpdate);

      // Keepalive heartbeat ping every 15s to prevent proxy timeouts
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      cleanup();
    },
  });

  req.signal.addEventListener('abort', () => {
    cleanup();
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
