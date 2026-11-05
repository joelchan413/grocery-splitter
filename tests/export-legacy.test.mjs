import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const script = path.resolve('scripts/export-legacy-db.mjs');
test('legacy export includes original photos and current metadata without overwriting live files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grocery-export-test-'));
  try {
    fs.mkdirSync(path.join(root, 'receipt-photos'));
    const encoded = JSON.stringify(['original photo']);
    const ref = createHash('sha256').update(encoded).digest('hex');
    const photoFile = path.join(root, 'receipt-photos', `${ref}.json`);
    fs.writeFileSync(photoFile, encoded);
    const trip = { id: 't1', storeName: 'Latest edit', receiptImagesRef: ref };
    const stored = { storageVersion: 2, household: { id: 'h' }, paidShares: { t1: { p2: 123 } }, trips: { t1: trip }, history: [trip] };
    const live = path.join(root, 'database.json');
    const output = path.join(root, 'export.json');
    fs.writeFileSync(live, JSON.stringify(stored));
    const run = (file) => execFileSync(process.execPath, [script, root, file], { stdio: 'pipe' });
    run(output);
    const exported = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(exported.storageVersion, undefined);
    assert.equal(exported.trips.t1.receiptImagesRef, undefined);
    assert.deepEqual(exported.trips.t1.receiptImages, ['original photo']);
    assert.deepEqual(exported.history[0].receiptImages, ['original photo']);
    assert.deepEqual(exported.paidShares, stored.paidShares);
    assert.equal(exported.trips.t1.storeName, 'Latest edit');
    assert.throws(() => run(live));
    assert.throws(() => run(output));
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')), stored);
    fs.writeFileSync(photoFile, '["corrupt"]');
    const damaged = path.join(root, 'damaged.json');
    assert.throws(() => run(damaged));
    assert.equal(fs.existsSync(damaged), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
