import webpush, { WebPushError } from 'web-push';
import type { Trip } from '@/types';
import type { PaidShares } from '@/lib/payments';
import { isTransientPushFailure, PUSH_RETRY_DELAYS_MS, type PushSubscriptionRecord } from '@/lib/push-subscriptions';
import {
  dueReminders,
  everyoneReadyMessages,
  HOUR_MS,
  isEveryoneReady,
  isNewlySubmitted,
  isReminderHour,
  paymentReceivedMessages,
  readyTripsToCatchUp,
  shareIncreaseMessages,
  tripSubmittedMessages,
  type Outgoing,
} from '@/lib/notification-rules';
import {
  getDatabase,
  getHiddenTripIds,
  getNotificationState,
  getPaidShares,
  getPushSubscriptions,
  getTrip,
  removePushSubscriptions,
  tripEvents,
  updateNotificationState,
} from '@/lib/server-db';

/**
 * Sends the household's push notifications. Saves and payments are announced on `tripEvents`;
 * this module decides what each change means (see notification-rules) and sends it.
 * Server only: started once from instrumentation.
 */

/** Waits after the last ready tap, so a mistaken tap that is undone right away sends nothing. */
const READY_SETTLE_MS = 30 * 1000;
/** Claims change one tap at a time; wait for the edits to stop before comparing shares. */
const CLAIMS_SETTLE_MS = 3 * 60 * 1000;
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configureWebPush(): boolean {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || 'mailto:grocerysplit@example.com', publicKey, privateKey);
  return true;
}

/**
 * Sends one notification to one device. A brief push-service outage is retried a few times;
 * an expired subscription is removed. Once a push service accepts a message, it holds it until the phone is reachable.
 */
async function deliver(device: PushSubscriptionRecord, message: Outgoing['message'], attempt = 0): Promise<void> {
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify(message), {
      TTL: PUSH_TTL_SECONDS,
      urgency: 'normal',
      topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
    });
  } catch (err) {
    const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) {
      removePushSubscriptions([device.endpoint]);
      return;
    }
    const delay = PUSH_RETRY_DELAYS_MS[attempt];
    console.error(`Push notification failed${delay != null && isTransientPushFailure(statusCode) ? ', will retry' : ''}:`,
      err instanceof Error ? err.message : err);
    if (delay == null || !isTransientPushFailure(statusCode)) return;
    setTimeout(() => {
      // Skip the retry if the device unsubscribed or moved to another roommate meanwhile.
      const current = getPushSubscriptions().find((s) => s.endpoint === device.endpoint);
      if (current?.participantId === device.participantId) deliver(current, message, attempt + 1).catch(() => {});
    }, delay).unref?.();
  }
}

async function send(outgoing: readonly Outgoing[]): Promise<void> {
  if (!outgoing.length) return;
  const subscriptions = getPushSubscriptions();
  await Promise.all(outgoing.flatMap(({ participantId, message }) =>
    subscriptions.filter((s) => s.participantId === participantId).map((s) => deliver(s, message))
  ));
}

function sendSoon(outgoing: Outgoing[]): void {
  send(outgoing).catch((err) => console.error('Push notifications failed:', err));
}

/** Runs a check for a trip once its edits have stopped for `delay`. */
function debounced(delay: number, check: (tripId: string) => void) {
  const timers = new Map<string, NodeJS.Timeout>();
  return (tripId: string) => {
    clearTimeout(timers.get(tripId));
    const timer = setTimeout(() => {
      timers.delete(tripId);
      try { check(tripId); } catch (err) { console.error('Notification check failed:', err); }
    }, delay);
    timer.unref?.();
    timers.set(tripId, timer);
  };
}

const isHidden = (tripId: string) => getHiddenTripIds().includes(tripId);

const checkEveryoneReady = debounced(READY_SETTLE_MS, (tripId) => {
  const trip = getTrip(tripId);
  const household = getDatabase().household;
  if (!trip || isHidden(tripId) || getNotificationState().allReady[tripId] || !isEveryoneReady(trip, household)) return;
  updateNotificationState((state) => ({ ...state, allReady: { ...state.allReady, [tripId]: new Date().toISOString() } }));
  sendSoon(everyoneReadyMessages(trip, household));
});

const checkShareIncreases = debounced(CLAIMS_SETTLE_MS, (tripId) => {
  const trip = getTrip(tripId);
  if (!trip || isHidden(tripId)) return;
  const state = getNotificationState();
  const notified = state.shareIncrease[tripId] ?? {};
  const { outgoing, next } = shareIncreaseMessages(trip, getDatabase().household, getPaidShares(), notified);
  if (JSON.stringify(next) !== JSON.stringify(notified)) {
    updateNotificationState((current) => {
      const shareIncrease = { ...current.shareIncrease };
      if (Object.keys(next).length) shareIncrease[tripId] = next;
      else delete shareIncrease[tripId];
      return { ...current, shareIncrease };
    });
  }
  sendSoon(outgoing);
});

function onTripSaved(before: Trip | null, after: Trip): void {
  // Hidden trips are out of the household's view, so they send nothing. Reminders skip them too.
  if (isHidden(after.id)) return;
  const household = getDatabase().household;
  if (isNewlySubmitted(before, after, getNotificationState())) {
    updateNotificationState((state) => ({ ...state, submitted: { ...state.submitted, [after.id]: new Date().toISOString() } }));
    sendSoon(tripSubmittedMessages(after, household));
  }
  if (isEveryoneReady(after, household)) checkEveryoneReady(after.id);
  if (Object.hasOwn(getPaidShares(), after.id)) checkShareIncreases(after.id);
}

function onPaymentsSaved(before: PaidShares, after: PaidShares): void {
  const db = getDatabase();
  sendSoon(paymentReceivedMessages(before, after, db.trips, db.household, getHiddenTripIds()));
}

function catchUpReadyTrips(now: Date): void {
  const db = getDatabase();
  const { mark, announce } = readyTripsToCatchUp(Object.values(db.trips), db.household, getHiddenTripIds(), getNotificationState(), now);
  if (!mark.length) return;
  const markedAt = now.toISOString();
  updateNotificationState((state) => ({
    ...state,
    allReady: { ...state.allReady, ...Object.fromEntries(mark.map((trip) => [trip.id, markedAt])) },
  }));
  sendSoon(announce.flatMap((trip) => everyoneReadyMessages(trip, db.household)));
}

function sendReminders(now: Date): void {
  if (!isReminderHour(now, process.env.REMINDER_TIME_ZONE?.trim())) return;
  const db = getDatabase();
  const outgoing = dueReminders({
    trips: Object.values(db.trips),
    household: db.household,
    paid: getPaidShares(),
    hiddenIds: getHiddenTripIds(),
    state: getNotificationState(),
    now,
  });
  if (!outgoing.length) return;
  const sentAt = now.toISOString();
  updateNotificationState((state) => ({
    ...state,
    lastReminder: { ...state.lastReminder, ...Object.fromEntries(outgoing.map((o) => [o.participantId, sentAt])) },
  }));
  sendSoon(outgoing);
}

function hourlyCheck(): void {
  const now = new Date();
  catchUpReadyTrips(now);
  sendReminders(now);
}

/** A handler failure must never break the save that triggered it. */
function safely<A extends unknown[]>(handler: (...args: A) => void) {
  return (...args: A) => {
    try { handler(...args); } catch (err) { console.error('Notification check failed:', err); }
  };
}

const globalForNotifications = globalThis as unknown as { notificationsStarted?: boolean };

export function startNotifications(): void {
  if (globalForNotifications.notificationsStarted) return;
  globalForNotifications.notificationsStarted = true;
  if (!configureWebPush()) {
    console.log('Push notifications are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to turn them on.');
    return;
  }
  tripEvents.on('trip-saved', safely(onTripSaved));
  tripEvents.on('payments-saved', safely(onPaymentsSaved));
  // Check every hour, and soon after starting so a restart neither skips a day nor loses a pending ready check.
  setTimeout(safely(hourlyCheck), 60 * 1000).unref?.();
  setInterval(safely(hourlyCheck), HOUR_MS).unref?.();
}
