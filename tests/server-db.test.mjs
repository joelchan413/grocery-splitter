import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadLib } from './helpers/load-lib.mjs';

const nodeRequire = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const historyModule = { exports: {} };
const historySource = fs.readFileSync(path.join(__dirname, '../src/lib/trip-history.ts'), 'utf8');
new Function('module', 'exports', 'require', ts.transpileModule(historySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(historyModule, historyModule.exports, () => ({ loadCachedTrip: async () => null }));

const paymentsModule = { exports: {} };
const paymentsSource = fs.readFileSync(path.join(__dirname, '../src/lib/payments.ts'), 'utf8');
new Function('module', 'exports', ts.transpileModule(paymentsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(paymentsModule, paymentsModule.exports);

const source = fs.readFileSync(path.join(__dirname, '../src/lib/server-db.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

function boot(files, { denyWrites = false, writes = [], failPhoto = false, failCommit = false, operations = [], failPhotoSync = false } = {}) {
  const fakeFs = {
    constants: fs.constants,
    openSync: (file) => file,
    closeSync: () => {},
    fsyncSync: (file) => {
      operations.push(`sync:${file}`);
      if (failPhotoSync && file.includes('/receipt-photos/')) throw new Error('Photo flush failed');
    },
    mkdirSync: () => { if (denyWrites) throw new Error('EACCES: permission denied'); },
    copyFileSync: (from, to) => {
      if (denyWrites) throw new Error('EACCES: permission denied');
      files.set(to, files.get(from));
    },
    existsSync: (file) => file === '/app/data' || files.has(file),
    readFileSync: (file) => files.get(file),
    writeFileSync: (file, value) => {
      if (denyWrites || (failPhoto && file.includes('/receipt-photos/'))) throw new Error('EACCES: permission denied');
      writes.push({ file, bytes: Buffer.byteLength(value) });
      files.set(file, value);
    },
    renameSync: (from, to) => {
      operations.push(`rename:${to}`);
      if (failCommit && to === '/app/data/database.json') throw new Error('Failed metadata commit');
      files.set(to, files.get(from));
      files.delete(from);
    },
    unlinkSync: (file) => files.delete(file),
  };
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => name === '@/lib/trip-history' ? historyModule.exports : name === '@/lib/payments' ? paymentsModule.exports : name === '@/lib/notification-rules' || name === '@/lib/push-subscriptions' || name === '@/lib/food-tracker' || name === '@/lib/trip-status' ? loadLib(name.slice(6)) : name === 'fs' ? fakeFs : name === 'path' ? path.posix : nodeRequire(name),
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

test('a stale save cannot move a trip backwards, but its other edits still land', () => {
  const initial = storedDatabase();
  initial.trips.t1 = { id: 't1', status: 'claiming', storeName: 'Original', claims: {} };
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  const saved = [];
  db.tripEvents.on('trip-saved', (before, after) => saved.push([before?.status, after.status]));

  const patched = db.updateTripPartial('t1', { status: 'review', claims: { milk: { p2: 1 } } });
  assert.equal(patched.status, 'claiming');
  assert.deepEqual(JSON.parse(JSON.stringify(patched.claims)), { milk: { p2: 1 } });
  db.saveTrip({ id: 't1', status: 'review', storeName: 'Reuploaded', claims: {} });
  assert.equal(db.getTrip('t1').status, 'claiming');
  assert.equal(db.getTrip('t1').storeName, 'Reuploaded');
  assert.deepEqual(saved, [['claiming', 'claiming'], ['claiming', 'claiming']], 'notifications never see a trip go back to review');

  db.archiveTrip('t1');
  db.updateTripPartial('t1', { status: 'claiming', storeName: 'Fixed after archiving' });
  assert.equal(boot(files).getTrip('t1').status, 'settled');
  assert.equal(boot(files).getTrip('t1').storeName, 'Fixed after archiving');
});

test('a trip still being checked cannot be archived', () => {
  const initial = storedDatabase();
  initial.trips.t1 = { id: 't1', status: 'review', storeName: 'Original' };
  initial.activeTripId = 't1';
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  assert.throws(() => db.archiveTrip('t1'), db.TripStatusError);
  assert.equal(boot(files).getTrip('t1').status, 'review');
  assert.equal(db.getActiveTrip().id, 't1');
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
test('payments persist across restart, are idempotent, and leave trips and hidden runs untouched', () => {
  const initial = storedDatabase();
  initial.household.participants = [{ id: 'p2' }, { id: 'p3' }];
  initial.trips = { t1: { id: 't1' }, t2: { id: 't2' } };
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  const paid = (database) => JSON.parse(JSON.stringify(database.getPaidShares()));
  const pay = (tripId, participantId, cents) => ({ tripId, participantId, cents });

  assert.deepEqual(paid(db), {}, 'databases without the field have no payments');
  db.recordPayments([pay('t1', 'p2', 500), pay('t1', 'p3', 250), pay('t2', 'p2', 100)]);
  db.recordPayments([pay('t1', 'p2', 500)]);
  assert.deepEqual(paid(boot(files)), { t1: { p2: 500, p3: 250 }, t2: { p2: 100 } });
  db.clearPayments([{ tripId: 't1', participantId: 'p3' }, { tripId: 't2', participantId: 'p2' }]);
  assert.deepEqual(paid(boot(files)), { t1: { p2: 500 } });
  assert.deepEqual(Array.from(db.getHiddenTripIds()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(boot(files).getTrip('t1'))), { id: 't1' });
});

test('payments for unknown trips or roommates are rejected without writing', () => {
  const initial = storedDatabase();
  initial.household.participants = [{ id: 'p2' }];
  initial.trips = { t1: { id: 't1' } };
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  assert.throws(() => db.recordPayments([{ tripId: 'missing', participantId: 'p2', cents: 1 }]), /Unknown trip or roommate/);
  assert.throws(() => db.recordPayments([{ tripId: 't1', participantId: 'p9', cents: 1 }]), /Unknown trip or roommate/);
  assert.throws(() => db.recordPayments([{ tripId: 'toString', participantId: 'p2', cents: 1 }]), /Unknown trip or roommate/);
  assert.deepEqual(JSON.parse(JSON.stringify(boot(files).getPaidShares())), {});
});

function databaseWithPhotos() {
  const data = storedDatabase();
  data.trips.t1 = { id: 't1', createdAt: '2026-01-01', receiptImages: ['data:image/png;base64,' + 'A'.repeat(1024 * 1024)], claims: {} };
  // This is how the legacy on-disk format repeats photos in both locations.
  data.history = [structuredClone(data.trips.t1)];
  return data;
}

test('legacy migration retains an exact backup and writes photos once, outside recurring metadata saves', () => {
  const initial = JSON.stringify(databaseWithPhotos());
  const files = new Map([['/app/data/database.json', initial]]);
  const writes = [];
  const db = boot(files, { writes });
  db.updateTripPartial('t1', { claims: { milk: { p2: 1 } } });
  assert.equal(files.get('/app/data/database.v1-backup.json'), initial);
  const stored = JSON.parse(files.get('/app/data/database.json'));
  assert.equal(stored.storageVersion, 2);
  assert.equal(stored.trips.t1.receiptImages, undefined);
  assert.match(stored.trips.t1.receiptImagesRef, /^[a-f0-9]{64}$/);
  const photoWrites = () => writes.filter((w) => w.file.includes('/receipt-photos/')).length;
  assert.equal(photoWrites(), 1);
  assert.ok(files.get('/app/data/database.json').length < 2000);

  const restarted = boot(files, { writes });
  assert.deepEqual(Array.from(restarted.getTrip('t1').receiptImages), databaseWithPhotos().trips.t1.receiptImages);
  assert.deepEqual(Array.from(restarted.getTripHistory()[0].receiptImages), databaseWithPhotos().trips.t1.receiptImages);
  assert.equal(restarted.getTrip('t1').receiptImagesRef, undefined, 'internal references never leak into the API');
  restarted.updateTripPartial('t1', { readyParticipantIds: ['p2'] });
  assert.equal(photoWrites(), 1, 'claims and readiness must not write photo files again, including after restart');
  assert.equal(files.get('/app/data/database.v1-backup.json'), initial, 'later saves never replace the migration backup');
});

test('failed photo and metadata commits preserve the last complete database and emit no updates', () => {
  for (const options of [{ failPhoto: true }, { failCommit: true }]) {
    const initial = JSON.stringify(databaseWithPhotos());
    const files = new Map([['/app/data/database.json', initial]]);
    const db = boot(files, options);
    let events = 0;
    db.tripEvents.on('trip-updated:t1', () => events++);
    assert.throws(() => db.updateTripPartial('t1', { claims: { milk: { p2: 1 } } }));
    assert.equal(files.get('/app/data/database.json'), initial);
    assert.equal(JSON.stringify(db.getTrip('t1').claims), '{}');
    assert.equal(JSON.stringify(boot(files).getTrip('t1').claims), '{}');
    assert.equal(events, 0);
    assert.equal([...files.keys()].some((file) => file.includes('.tmp.')), false);
  }
});

test('missing or corrupt photo files reject loading without replacing the database', () => {
  for (const corrupt of [false, true]) {
    const files = new Map([['/app/data/database.json', JSON.stringify(databaseWithPhotos())]]);
    boot(files).updateTripPartial('t1', { claims: {} });
    const metadata = files.get('/app/data/database.json');
    const photoFile = [...files.keys()].find((file) => file.includes('/receipt-photos/'));
    if (corrupt) files.set(photoFile, '["corrupted"]');
    else files.delete(photoFile);
    assert.throws(() => boot(files).getDatabase());
    assert.equal(files.get('/app/data/database.json'), metadata);
  }
});

test('photo replacement and removal survive restart without touching the immutable originals', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(databaseWithPhotos())]]);
  const db = boot(files);
  db.updateTripPartial('t1', { receiptImages: ['replacement'] });
  assert.deepEqual(Array.from(boot(files).getTrip('t1').receiptImages), ['replacement']);
  db.updateTripPartial('t1', { receiptImages: [] });
  assert.deepEqual(Array.from(boot(files).getTrip('t1').receiptImages), []);
});

test('unsupported database versions and unsafe photo references cannot be loaded', () => {
  for (const data of [
    { ...storedDatabase(), storageVersion: 99 },
    { ...storedDatabase(), storageVersion: 2, trips: { t1: { id: 't1', receiptImagesRef: '../../secret' } } },
  ]) {
    const raw = JSON.stringify(data);
    const files = new Map([['/app/data/database.json', raw]]);
    assert.throws(() => boot(files).getDatabase());
    assert.equal(files.get('/app/data/database.json'), raw);
  }
});

test('external photo references cannot be persisted and malformed photo arrays cannot replace a valid database', () => {
  const initial = storedDatabase();
  initial.trips.t1 = { id: 't1', receiptImages: [] };
  const files = new Map([['/app/data/database.json', JSON.stringify(initial)]]);
  const db = boot(files);
  db.updateTripPartial('t1', { receiptImagesRef: '../../private' });
  assert.deepEqual(Array.from(boot(files).getTrip('t1').receiptImages), []);
  const committed = files.get('/app/data/database.json');
  assert.throws(() => db.updateTripPartial('t1', { receiptImages: [123] }), /Invalid receipt photos/);
  assert.equal(files.get('/app/data/database.json'), committed);
});

test('photo data and directory entries are flushed before the metadata commit', () => {
  const files = new Map([['/app/data/database.json', JSON.stringify(databaseWithPhotos())]]);
  const operations = [];
  boot(files, { operations }).updateTripPartial('t1', { claims: {} });
  const photoFileSync = operations.findIndex((op) => op.startsWith('sync:/app/data/receipt-photos/') && op.includes('.tmp.'));
  const photoRename = operations.findIndex((op) => op.startsWith('rename:/app/data/receipt-photos/'));
  const photoDirectorySync = operations.indexOf('sync:/app/data/receipt-photos');
  const metadataRename = operations.indexOf('rename:/app/data/database.json');
  assert.ok(operations.indexOf('sync:/app/data') >= 0);
  assert.ok(photoFileSync >= 0 && photoFileSync < photoRename);
  assert.ok(photoRename < photoDirectorySync && photoDirectorySync < metadataRename);
});

test('a failed photo flush never commits metadata or publishes the update', () => {
  const original = JSON.stringify(databaseWithPhotos());
  const files = new Map([['/app/data/database.json', original]]);
  const db = boot(files, { failPhotoSync: true });
  let emitted = false;
  db.tripEvents.on('trip-updated:t1', () => { emitted = true; });
  assert.throws(() => db.updateTripPartial('t1', { claims: { milk: { p2: 1 } } }), /Photo flush failed/);
  assert.equal(files.get('/app/data/database.json'), original);
  assert.equal(emitted, false);
});
