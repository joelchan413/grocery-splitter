'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PushStatus =
  | 'loading'
  /** This browser can't receive web push at all. */
  | 'unsupported'
  /** iPhone or iPad in Safari: push only works once the app is added to the home screen. */
  | 'needs-install'
  /** The server has no push keys set. */
  | 'not-configured'
  /** The person blocked notifications for this site in the browser. */
  | 'denied'
  | 'off'
  | 'on';

export interface PushNotifications {
  status: PushStatus;
  /** Whose notifications this device gets, while on. */
  participantId: string | null;
  busy: boolean;
  error: string | null;
  /** Turns notifications on for a roommate, or moves this device's notifications to them. */
  enable: (participantId: string) => Promise<void>;
  disable: () => Promise<void>;
}

// Chosen in Settings, separately from "Who's claiming?", which changes whenever someone claims for a roommate.
const STORAGE_KEY = 'grocery_splitter_push_participant_v1';

function readLinked(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function writeLinked(participantId: string | null): void {
  try {
    if (participantId) localStorage.setItem(STORAGE_KEY, participantId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function base64UrlToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isAppleMobile(): boolean {
  // iPadOS reports itself as a Mac, but has touch.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function saveSubscription(subscription: PushSubscription, participantId: string): Promise<void> {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId, subscription: subscription.toJSON() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Server returned ${res.status}`);
  }
}

/** Web push for this device, for the roommate picked in Settings. */
export function usePushNotifications(): PushNotifications {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const publicKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) {
        if (!cancelled) setStatus(isAppleMobile() && !isStandalone() ? 'needs-install' : 'unsupported');
        return;
      }
      try {
        const [reg, keyResponse] = await Promise.all([
          navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }),
          fetch('/api/push', { cache: 'no-store' }),
        ]);
        registration.current = reg;
        publicKey.current = keyResponse.ok ? ((await keyResponse.json()).publicKey ?? null) : null;
        const existing = await reg.pushManager.getSubscription();
        const linked = readLinked();
        if (cancelled) return;
        if (!publicKey.current) setStatus('not-configured');
        else if (Notification.permission === 'denied') setStatus('denied');
        else if (existing && linked) {
          setParticipantId(linked);
          setStatus('on');
          // The browser may have renewed the subscription since; keep the server's copy current.
          saveSubscription(existing, linked).catch((err) => console.error('Could not refresh notifications:', err));
        } else setStatus('off');
      } catch {
        if (!cancelled) setStatus('unsupported');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async (participantId: string) => {
    const reg = registration.current;
    if (!reg || !publicKey.current) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      let subscription = await reg.pushManager.getSubscription();
      subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey.current) });
      await saveSubscription(subscription, participantId);
      writeLinked(participantId);
      setParticipantId(participantId);
      setStatus('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await registration.current?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
      writeLinked(null);
      setParticipantId(null);
      setStatus('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, participantId, busy, error, enable, disable };
}
