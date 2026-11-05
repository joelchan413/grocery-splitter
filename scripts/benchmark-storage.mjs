#!/usr/bin/env node
// Synthetic local-disk benchmark. Uses only temporary fixtures, never live data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'grocery-storage-benchmark-'));
const trips = Object.fromEntries(Array.from({ length: 50 }, (_, index) => {
  const id = `trip-${index}`;
  return [id, {
    id, householdId: 'h1', storeName: `Store ${index}`, date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z',
    payerId: 'p1', status: 'claiming', claims: {}, readyParticipantIds: [], taxTotal: 1, basketDiscount: 0,
    items: Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}`, name: 'Groceries', quantity: 1, unitPrice: 3, totalPrice: 3, isTaxable: false })),
    receiptImages: [`data:image/jpeg;base64,${'A'.repeat(256 * 1024)}${index}`],
  }];
}));
const fixture = JSON.stringify({ household: { id: 'h1', name: 'Benchmark', participants: [] }, activeTripId: 'trip-0', trips, history: Object.values(trips) });
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}
function moduleFrom(source, cwd, fsTools = fs) {
  const mod = { exports: {} };
  vm.runInNewContext(compile(source), {
    module: mod, exports: mod.exports,
    require: (name) => {
      if (name === 'fs') return fsTools;
      if (name === '@/lib/trip-cache') return { loadCachedTrip: async () => null };
      if (name.startsWith('@/lib/')) return moduleFrom(fs.readFileSync(path.join(root, 'src/lib', name.slice(6) + '.ts'), 'utf8'), cwd);
      return require(name);
    },
    process: { cwd: () => cwd, pid: process.pid }, console,
  });
  return mod.exports;
}
function measure(label, source) {
  const cwd = path.join(temporary, label);
  fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'data/database.json'), fixture);
  let written = 0;
  const instrumented = { ...fs, writeFileSync(file, value, ...args) { written += Buffer.byteLength(value); return fs.writeFileSync(file, value, ...args); } };
  const db = moduleFrom(source, cwd, instrumented);
  db.getDatabase();
  // Migration and two warm-up writes are excluded from steady-state claim latency.
  for (let i = 0; i < 3; i++) db.updateTripPartial('trip-0', { claims: { 'item-0': { p2: i % 2 } } });
  written = 0;
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    db.updateTripPartial('trip-0', { claims: { 'item-0': { p2: i % 2 } } });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { p50_ms: +samples[5].toFixed(2), p95_ms: +samples[11].toFixed(2), bytes_written_per_claim: written / 12 };
}
try {
  const baselineRef = process.argv[2] ?? 'HEAD';
  const baselineCommit = execFileSync('git', ['rev-parse', baselineRef], { cwd: root, encoding: 'utf8' }).trim();
  const baseline = execFileSync('git', ['show', `${baselineCommit}:src/lib/server-db.ts`], { cwd: root, encoding: 'utf8' });
  const current = fs.readFileSync(path.join(root, 'src/lib/server-db.ts'), 'utf8');
  console.log(JSON.stringify({
    node: process.version, baseline_commit: baselineCommit, fixture: { trips: 50, items_per_trip: 20, photo_kib_per_trip: 256, samples: 12 },
    before: measure('before', baseline), after: measure('after', current),
    limitations: 'Synthetic warm local-disk writes; excludes migration, HTTP, browser rendering, fsync and physical mobile devices.',
  }, null, 2));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
