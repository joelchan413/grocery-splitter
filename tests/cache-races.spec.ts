import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { test, expect } from '@playwright/test';

// Run the actual cache/storage modules against real IndexedDB without mounting
// the app, so network refreshes cannot accidentally repair the regression.
const sources = Object.fromEntries(['storage', 'trip-cache', 'trip-sync', 'trip-history', 'payments'].map((name) => [
  `@/lib/${name}`,
  ts.transpileModule(fs.readFileSync(path.join(process.cwd(), 'src/lib', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

test.beforeEach(async ({ page }) => {
  await page.route('**/cache-race-harness', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Cache race regression</title>' }));
  await page.goto('/cache-race-harness');
});

test('late legacy migrations cannot replace the newer offline snapshot', async ({ page }) => {
  const result = await page.evaluate(async (sources) => {
    const modules = new Map<string, { exports: unknown }>();
    const load = (name: string): unknown => {
      const cached = modules.get(name);
      if (cached) return cached.exports;
      const loadedModule = { exports: {} };
      modules.set(name, loadedModule);
      new Function('module', 'exports', 'require', sources[name])(loadedModule, loadedModule.exports, load);
      return loadedModule.exports;
    };
    const storage = load('@/lib/storage') as typeof import('../src/lib/storage');
    const cache = load('@/lib/trip-cache') as typeof import('../src/lib/trip-cache');
    const original: import('../src/types').Trip = {
      id: 'overlap', householdId: 'h', storeName: 'Legacy', date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', payerId: 'p1', status: 'claiming', claims: {}, items: [],
      taxTotal: 0, basketDiscount: 0, readyParticipantIds: [], receiptImages: ['original photos'],
    };
    const newer = { ...original, storeName: 'New offline edit', updatedAt: '2026-01-02T00:00:00Z', receiptImages: ['new photos'] };
    localStorage.setItem('grocery_splitter_trip_history_v1', JSON.stringify([original]));
    const persisted = new Promise<void>((resolve) => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        set.call(this, key, value);
        if (key === 'grocery_splitter_trip_history_v1' && JSON.parse(value)[0]?.updatedAt === newer.updatedAt) resolve();
      };
    });
    storage.saveTripHistory(storage.loadTripHistory());
    storage.saveActiveTrip(newer);
    storage.addOrUpdateTripHistory(newer);
    await persisted;
    const snapshot = await cache.loadCachedTrip(original.id);
    // Also exercise a late older write from another continuation directly.
    await cache.cacheTrip(original);
    const afterStaleSave = await cache.loadCachedTrip(original.id);
    return { snapshot, afterStaleSave, restored: await storage.loadActiveTrip() };
  }, sources);
  for (const trip of [result.snapshot, result.afterStaleSave, result.restored]) {
    expect(trip?.storeName).toBe('New offline edit');
    expect(trip?.receiptImages).toEqual(['new photos']);
  }
});

test('completed promise deduplication does not suppress a later save of the same snapshot object', async ({ page }) => {
  const result = await page.evaluate(async (sources) => {
    const modules = new Map<string, { exports: unknown }>();
    const load = (name: string): unknown => {
      if (modules.has(name)) return modules.get(name)!.exports;
      const loadedModule = { exports: {} };
      modules.set(name, loadedModule);
      new Function('module', 'exports', 'require', sources[name])(loadedModule, loadedModule.exports, load);
      return loadedModule.exports;
    };
    const cache = load('@/lib/trip-cache') as typeof import('../src/lib/trip-cache');
    const a: import('../src/types').Trip = {
      id: 'same-time', householdId: 'h', storeName: 'A', date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', payerId: 'p1', status: 'claiming', claims: {}, items: [],
      taxTotal: 0, basketDiscount: 0, readyParticipantIds: [], receiptImages: ['A photos'],
    };
    const b = { ...a, storeName: 'B', receiptImages: ['B photos'] };
    await cache.cacheTrip(a);
    await cache.cacheTrip(b);
    await cache.cacheTrip(a);
    return cache.loadCachedTrip(a.id);
  }, sources);
  expect(result?.storeName).toBe('A');
  expect(result?.receiptImages).toEqual(['A photos']);
});

test('fresh sessions reuse the persisted photo record for unchanged receipts', async ({ page }) => {
  const result = await page.evaluate(async (sources) => {
    const freshModules = () => {
      const modules = new Map<string, { exports: unknown }>();
      const load = (name: string): unknown => {
        if (modules.has(name)) return modules.get(name)!.exports;
        const loadedModule = { exports: {} };
        modules.set(name, loadedModule);
        new Function('module', 'exports', 'require', sources[name])(loadedModule, loadedModule.exports, load);
        return loadedModule.exports;
      };
      return load('@/lib/trip-cache') as typeof import('../src/lib/trip-cache');
    };
    for (let session = 0; session < 4; session++) {
      const cache = freshModules();
      await cache.cacheTrip({
        id: 'reopened', householdId: 'h', storeName: `Session ${session}`, date: '2026-01-01',
        createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-0${session + 1}T00:00:00Z`,
        payerId: 'p1', status: 'claiming', claims: {}, items: [], taxTotal: 0, basketDiscount: 0,
        readyParticipantIds: [], receiptImages: ['data:image/png;base64,' + 'A'.repeat(1024 * 1024)],
      });
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-splitter-cache', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('photos').objectStore('photos').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, sources);
  expect(result).toBe(1);
});

test('an explicitly opened server snapshot replaces a newer cached copy and survives delayed migration', async ({ page }) => {
  const result = await page.evaluate(async (sources) => {
    const modules = new Map<string, { exports: unknown }>();
    const load = (name: string): unknown => {
      if (modules.has(name)) return modules.get(name)!.exports;
      const loadedModule = { exports: {} };
      modules.set(name, loadedModule);
      new Function('module', 'exports', 'require', sources[name])(loadedModule, loadedModule.exports, load);
      return loadedModule.exports;
    };
    const cache = load('@/lib/trip-cache') as typeof import('../src/lib/trip-cache');
    const storage = load('@/lib/storage') as typeof import('../src/lib/storage');
    const local: import('../src/types').Trip = {
      id: 'deliberate-open', householdId: 'h', storeName: 'Unsynced local', date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-10T00:00:00Z', payerId: 'p1', status: 'claiming', claims: {}, items: [],
      taxTotal: 0, basketDiscount: 0, readyParticipantIds: [], receiptImages: ['local photo'],
    };
    const server = { ...local, storeName: 'Server copy shown in UI', updatedAt: '2026-01-05T00:00:00Z', receiptImages: ['server photo'] };
    await cache.cacheTrip(local);
    // A guarded save in flight must not swallow the authoritative save of the
    // same object through promise deduplication.
    const guarded = cache.cacheTrip(server);
    const pointerPublished = new Promise<void>((resolve) => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        set.call(this, key, value);
        if (key === 'grocery_splitter_active_trip_v1') resolve();
      };
    });
    storage.saveActiveTrip(server, { authoritative: true });
    await guarded;
    await pointerPublished;
    await cache.cacheTrip(local); // A delayed legacy migration must not undo the user's selection.
    return { restored: await storage.loadActiveTrip(), cached: await cache.loadCachedTrip(local.id) };
  }, sources);
  for (const trip of [result.restored, result.cached]) {
    expect(trip?.storeName).toBe('Server copy shown in UI');
    expect(trip?.receiptImages).toEqual(['server photo']);
    expect(trip).not.toHaveProperty('revisionFloor');
  }
});

test('an explicit archive below a retained revision floor remains available offline', async ({ page }) => {
  const result = await page.evaluate(async (sources) => {
    const modules = new Map<string, { exports: unknown }>();
    const load = (name: string): unknown => {
      if (modules.has(name)) return modules.get(name)!.exports;
      const loadedModule = { exports: {} };
      modules.set(name, loadedModule);
      new Function('module', 'exports', 'require', sources[name])(loadedModule, loadedModule.exports, load);
      return loadedModule.exports;
    };
    const cache = load('@/lib/trip-cache') as typeof import('../src/lib/trip-cache');
    const storage = load('@/lib/storage') as typeof import('../src/lib/storage');
    const history = load('@/lib/trip-history') as typeof import('../src/lib/trip-history');
    const base = Date.parse('2099-01-01T00:00:00Z');
    const ahead: import('../src/types').Trip = {
      id: 'archive-floor', householdId: 'h', storeName: 'Clock skew archive', date: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: new Date(base + 10).toISOString(), payerId: 'p1',
      status: 'claiming', claims: {}, items: [], taxTotal: 0, basketDiscount: 0,
      readyParticipantIds: [], receiptImages: ['receipt photo'],
    };
    const server = { ...ahead, updatedAt: new Date(base + 5).toISOString() };
    const edited = { ...server, updatedAt: new Date(base + 7).toISOString() };
    await cache.cacheTrip(ahead);
    await cache.cacheTrip(server, { authoritative: true });
    await cache.cacheTrip(edited, { authoritative: true });
    localStorage.setItem('grocery_splitter_trip_history_v1', JSON.stringify([{ ...edited, receiptImages: [], receiptImagesOmitted: true }]));
    const archived = storage.archiveTrip(edited).find((trip) => trip.id === edited.id)!;
    const cached = await cache.loadCachedTrip(edited.id);
    const fetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Offline'); };
    try {
      const reopened = await history.loadTripDetails({ ...archived, receiptImages: [], receiptImagesOmitted: true });
      return { cached, reopened, archivedAt: Date.parse(archived.updatedAt!), floor: Date.parse(ahead.updatedAt!) };
    } finally { window.fetch = fetch; }
  }, sources);
  expect(result.archivedAt).toBeLessThan(result.floor);
  expect(result.cached?.status).toBe('settled');
  expect(result.reopened.status).toBe('settled');
  expect(result.reopened.receiptImages).toEqual(['receipt photo']);
});
