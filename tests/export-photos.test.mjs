import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

function loadModule(relPath) {
  const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, (name) => {
    if (name === '@/lib/zip') return loadModule('../src/lib/zip.ts');
    return nodeRequire(name);
  });
  return mod.exports;
}

const { createZip } = loadModule('../src/lib/zip.ts');
const { collectReceiptPhotos, buildExportZip } = loadModule('../src/lib/export-photos.ts');

/** Independent reader: walks the central directory and returns every stored file after checking its CRC. */
function readZip(bytes) {
  const buf = Buffer.from(bytes);
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50, 'end-of-central-directory signature');
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(cursor), 0x02014b50, 'central directory signature');
    assert.equal(buf.readUInt16LE(cursor + 10), 0, 'stored, not compressed');
    const crc = buf.readUInt32LE(cursor + 16);
    const size = buf.readUInt32LE(cursor + 24);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50, 'local header signature');
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLength;
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(zlib.crc32(data), crc, `crc of ${name}`);
    files[name] = data;
    cursor += 46 + nameLength;
  }
  return files;
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 250, 251, 252, 253]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 255, 0, 128]);
const png64 = `data:image/png;base64,${png.toString('base64')}`;
const jpeg64 = `data:image/jpeg;base64,${jpeg.toString('base64')}`;

test('createZip round-trips file names and bytes through an independent reader', () => {
  const entries = [
    { name: 'receipts.csv', data: new TextEncoder().encode('date,store\r\n2026-01-01,Café Möller\r\n') },
    { name: 'receipt_photos/Café_1.png', data: new Uint8Array(png) },
    { name: 'empty.txt', data: new Uint8Array(0) },
  ];
  const files = readZip(createZip(entries, new Date(2026, 5, 15, 12, 30, 10)));
  assert.deepEqual(Object.keys(files), entries.map((e) => e.name));
  for (const entry of entries) assert.deepEqual(new Uint8Array(files[entry.name]), entry.data);
});

test('an empty archive is still a valid ZIP', () => {
  assert.deepEqual(readZip(createZip([])), {});
});

test('photos are written as receipt_photos/<receipt_id>_<n>.<ext> with the original bytes', () => {
  const trips = [
    { id: 'trip-1', receiptImages: [png64, jpeg64] },
    { id: 'trip-2', receiptImages: [] },
    { id: 'trip-3' },
  ];
  const { files, skipped } = collectReceiptPhotos(trips);
  assert.equal(skipped, 0);
  assert.deepEqual(files.map((f) => f.name), ['receipt_photos/trip-1_1.png', 'receipt_photos/trip-1_2.jpg']);
  assert.deepEqual(Buffer.from(files[0].data), png);
  assert.deepEqual(Buffer.from(files[1].data), jpeg);
});

test('unreadable photos are skipped and counted, and unsafe or colliding ids cannot overwrite each other', () => {
  const trips = [
    { id: 'a/b', receiptImages: [png64, 'https://example.com/receipt.png', 'data:text/html;base64,AAAA'] },
    { id: 'a?b', receiptImages: [png64] },
  ];
  const { files, skipped } = collectReceiptPhotos(trips);
  assert.equal(skipped, 2);
  assert.deepEqual(files.map((f) => f.name), ['receipt_photos/a_b_1.png', 'receipt_photos/a_b_1_2.png']);
});

test('the export ZIP holds the unchanged CSV bytes plus photos only for the exported trips', () => {
  const csvBytes = new TextEncoder().encode('﻿date,store\r\n2026-03-05,"Joe\'s, Deli"\r\n');
  const { zip, photoCount, skippedPhotos } = buildExportZip(csvBytes, [{ id: 'trip-1', receiptImages: [png64] }]);
  assert.equal(photoCount, 1);
  assert.equal(skippedPhotos, 0);
  const files = readZip(zip);
  assert.deepEqual(Object.keys(files), ['receipts.csv', 'receipt_photos/trip-1_1.png']);
  assert.deepEqual(new Uint8Array(files['receipts.csv']), csvBytes);
  assert.deepEqual(Buffer.from(files['receipt_photos/trip-1_1.png']), png);
});
