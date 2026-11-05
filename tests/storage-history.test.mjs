import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  return ts.transpileModule(fs.readFileSync(`src/lib/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const source = compile('storage');
const historySource = compile('trip-history');
const paymentSource = compile('payments');
const syncSource = compile('trip-sync');
function createTab(values, saveTrip) {
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name).exports;
    if (name === '@/lib/trip-cache') return { cacheTrip: saveTrip, loadCachedTrip: async () => null };
    const loadedModule = { exports: {} };
    modules.set(name, loadedModule);
    vm.runInNewContext(name === '@/lib/storage' ? source : name === '@/lib/payments' ? paymentSource : name === '@/lib/trip-sync' ? syncSource : historySource, {
      module: loadedModule, exports: loadedModule.exports, require: load, window: {}, console,
      localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    });
    return loadedModule.exports;
  };
  return load('@/lib/storage');
}
const key = 'grocery_splitter_trip_history_v1';
const turn = () => new Promise((resolve) => setImmediate(resolve));
function trip(id, updatedAt = '2026-01-01') {
  return { id, updatedAt, createdAt: '2026-01-01', receiptImages: ['photo'] };
}

test('a delayed tab merges history saved by another tab while it waited for photo persistence', async () => {
  const values = new Map([[key, '[]']]);
  let finishA;
  let finishB;
  const a = createTab(values, () => new Promise((resolve) => { finishA = resolve; }));
  const b = createTab(values, () => new Promise((resolve) => { finishB = resolve; }));
  a.saveTripHistory([trip('a')]);
  b.saveTripHistory([trip('b')]);
  await turn();
  finishA();
  await turn();
  finishB();
  await turn();
  assert.deepEqual(JSON.parse(values.get(key)).map((trip) => trip.id).sort(), ['a', 'b']);
});

test('a delayed older history save cannot replace a newer revision published by another tab', async () => {
  const values = new Map([[key, '[]']]);
  let finishOld;
  const old = createTab(values, () => new Promise((resolve) => { finishOld = resolve; }));
  const fresh = createTab(values, async () => {});
  old.saveTripHistory([trip('same', '2026-01-01')]);
  fresh.saveTripHistory([trip('same', '2026-02-01')]);
  await turn();
  finishOld();
  await turn();
  assert.equal(JSON.parse(values.get(key))[0].updatedAt, '2026-02-01');
});
