import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const historyModule = { exports: {} };
const historySource = fs.readFileSync(path.join(__dirname, '../src/lib/trip-history.ts'), 'utf8');
new Function('module', 'exports', ts.transpileModule(historySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(historyModule, historyModule.exports);

const source = fs.readFileSync(path.join(__dirname, '../src/lib/server-db.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

function boot(files, { denyWrites = false } = {}) {
  const fakeFs = {
    existsSync: (file) => file === '/app/data' || files.has(file),
    readFileSync: (file) => files.get(file),
    writeFileSync: (file, value) => {
      if (denyWrites) throw new Error('EACCES: permission denied');
      files.set(file, value);
    },
    renameSync: (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    },
    unlinkSync: (file) => files.delete(file),
  };
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => name === '@/lib/trip-history' ? historyModule.exports : name === 'fs' ? fakeFs : name === 'path' ? path.posix : nodeRequire(name),
    process: { cwd: () => '/app' },
    console: { error: () => {} },
  });
  return sandboxModule.exports;
}

function storedDatabase() {
  return {
    household: { id: 'h', name: 'Original', participants: [] },
    activeTripId: null,
    trips: {},
    history: [],
  };
}

test('a failed write rejects the update and leaves cached and stored data unchanged', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(storedDatabase())]]);
  const db = boot(files, { denyWrites: true });
  assert.throws(
    () => db.updateHousehold({ id: 'h', name: 'Updated', participants: [] }),
    /EACCES/,
  );
  assert.equal(db.getHousehold().name, 'Original');
  assert.equal(boot(files).getHousehold().name, 'Original');
});

test('a missing database cannot silently initialize when the directory is unwritable', () => {
  const files = new Map();
  assert.throws(() => boot(files, { denyWrites: true }).getDatabase(), /EACCES/);
  assert.equal(files.has('/app/data/database.json'), false);
});

test('a failed trip update or archive leaves the cached trip unchanged', () => {
  const initial = storedDatabase();
  initial.activeTripId = 't1';
  initial.trips.t1 = { id: 't1', status: 'claiming', storeName: 'Original' };
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files, { denyWrites: true });

  assert.throws(() => db.updateTripPartial('t1', { storeName: 'Changed' }), /EACCES/);
  assert.equal(db.getTrip('t1').storeName, 'Original');

  assert.throws(() => db.archiveTrip('t1'), /EACCES/);
  assert.equal(db.getTrip('t1').status, 'claiming');
  assert.equal(db.getDatabase().activeTripId, 't1');
  assert.equal(db.getTripHistory().length, 0);
});

test('an unreadable database is not overwritten with defaults', () => {
  const files = new Map([['/app/data/database.json', '{broken']]);
  assert.throws(() => boot(files).getDatabase());
  assert.equal(files.get('/app/data/database.json'), '{broken');
});

test('a successful update survives a fresh process', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(storedDatabase())]]);
  boot(files).updateHousehold({ id: 'h', name: 'Updated', participants: [] });
  assert.equal(boot(files).getHousehold().name, 'Updated');
});

test('new and patched trips remain in shared history after restart', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(storedDatabase())]]);
  const db = boot(files);
  db.saveTrip({ id: 't1', status: 'claiming', storeName: 'First', createdAt: '2026-08-29T10:00:00Z' });
  db.updateTripPartial('t2', { id: 't2', status: 'claiming', storeName: 'Second', createdAt: '2026-08-30T10:00:00Z' });

  const restarted = boot(files);
  assert.equal(restarted.getDatabase().activeTripId, 't2');
  assert.deepEqual(Array.from(restarted.getTripHistory(), (trip) => trip.id), ['t2', 't1']);
  assert.equal(restarted.getTrip('t1').storeName, 'First');
  assert.equal(restarted.getTrip('t2').storeName, 'Second');
});

test('shared history order survives reopening, updates, archiving, and restart', () => {
  const initial = storedDatabase();
  const trips = [
    { id: 'b', createdAt: '2026-08-30T10:00:00Z' },
    { id: 'older', createdAt: '2026-08-29T10:00:00Z' },
    { id: 'a', createdAt: '2026-08-30T10:00:00Z' },
  ];
  initial.history = trips;
  initial.trips = Object.fromEntries(trips.map((trip) => [trip.id, trip]));
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  const ids = (database) => Array.from(database.getTripHistory(), (trip) => trip.id);
  assert.deepEqual(ids(db), ['a', 'b', 'older']);
  db.saveTrip(trips[1]);
  db.updateTripPartial('older', { storeName: 'Edited' });
  db.archiveTrip('older');
  assert.deepEqual(ids(db), ['a', 'b', 'older']);
  assert.deepEqual(ids(boot(files)), ['a', 'b', 'older']);
});

test('hidden trips persist across restart, are idempotent, and leave trips untouched', () => {
  const initial = storedDatabase();
  initial.trips.t1 = { id: 't1', status: 'claiming', storeName: 'Original' };
  initial.history = [initial.trips.t1];
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  const hidden = (database) => Array.from(database.getHiddenTripIds());

  assert.deepEqual(hidden(db), [], 'databases without the field have nothing hidden');
  assert.deepEqual(Array.from(db.setTripHidden('t1', true)), ['t1']);
  assert.deepEqual(Array.from(db.setTripHidden('t1', true)), ['t1'], 'hiding twice does not duplicate');
  assert.deepEqual(Array.from(db.setTripHidden('t2', true)), ['t1', 't2']);
  assert.deepEqual(hidden(boot(files)), ['t1', 't2']);
  assert.deepEqual(JSON.parse(JSON.stringify(boot(files).getTrip('t1'))), { id: 't1', status: 'claiming', storeName: 'Original' });
  assert.equal(boot(files).getTripHistory().length, 1, 'hidden trips stay in shared history');

  assert.deepEqual(Array.from(db.setTripHidden('t1', false)), ['t2']);
  assert.deepEqual(Array.from(db.setTripHidden('missing', false)), ['t2']);
  assert.deepEqual(hidden(boot(files)), ['t2']);
});

test('a failed write leaves the hidden list unchanged', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(storedDatabase())]]);
  const db = boot(files, { denyWrites: true });
  assert.throws(() => db.setTripHidden('t1', true), /EACCES/);
  assert.deepEqual(Array.from(db.getHiddenTripIds()), []);
  assert.deepEqual(Array.from(boot(files).getHiddenTripIds()), []);
});