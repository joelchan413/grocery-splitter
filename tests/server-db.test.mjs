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
    require: (name) => name === 'fs' ? fakeFs : name === 'path' ? path.posix : nodeRequire(name),
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
