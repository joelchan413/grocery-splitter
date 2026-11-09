/**
 * Which devices get push notifications for which roommate.
 * There are no accounts: each phone says whose it is in Settings, and can move to another roommate there.
 */
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  participantId: string;
  createdAt: string;
}

/** A household has a handful of phones; the caps only stop a runaway client filling the database. */
export const MAX_SUBSCRIPTIONS = 100;
export const MAX_SUBSCRIPTIONS_PER_PERSON = 10;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH && BASE64URL.test(value);
}

/** Push services are always HTTPS; anything else could make the server send requests elsewhere. */
export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The browser's `PushSubscription.toJSON()`, checked. */
export function parseBrowserSubscription(value: unknown): Pick<PushSubscriptionRecord, 'endpoint' | 'keys'> | null {
  const sub = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!sub || typeof sub !== 'object' || !isPushEndpoint(sub.endpoint)) return null;
  if (!sub.keys || typeof sub.keys !== 'object' || !isKey(sub.keys.p256dh) || !isKey(sub.keys.auth)) return null;
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export function sanitizeSubscriptions(value: unknown): PushSubscriptionRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: PushSubscriptionRecord[] = [];
  for (const entry of value) {
    const parsed = parseBrowserSubscription(entry);
    const { participantId, createdAt } = (entry ?? {}) as Partial<PushSubscriptionRecord>;
    if (!parsed || seen.has(parsed.endpoint) || typeof participantId !== 'string' || !participantId || typeof createdAt !== 'string') continue;
    seen.add(parsed.endpoint);
    result.push({ ...parsed, participantId, createdAt });
  }
  return result;
}

/**
 * Adds a device, or moves it to another roommate. The same endpoint is one device, so it is never
 * listed twice. Oldest devices are dropped first when a cap is reached.
 */
export function upsertSubscription(
  current: readonly PushSubscriptionRecord[],
  record: PushSubscriptionRecord
): PushSubscriptionRecord[] {
  const others = current.filter((s) => s.endpoint !== record.endpoint);
  const theirs = others.filter((s) => s.participantId === record.participantId);
  const overPerson = new Set(theirs.slice(0, Math.max(0, theirs.length - (MAX_SUBSCRIPTIONS_PER_PERSON - 1))).map((s) => s.endpoint));
  const kept = others.filter((s) => !overPerson.has(s.endpoint));
  return [...kept.slice(Math.max(0, kept.length - (MAX_SUBSCRIPTIONS - 1))), record];
}

export function removeSubscriptions(current: readonly PushSubscriptionRecord[], endpoints: readonly string[]): PushSubscriptionRecord[] {
  const gone = new Set(endpoints);
  return current.filter((s) => !gone.has(s.endpoint));
}
