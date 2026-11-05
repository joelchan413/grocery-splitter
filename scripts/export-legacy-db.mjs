#!/usr/bin/env node
// Offline rollback/export tool. Never replaces the live database or an existing file.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('Usage: node scripts/export-legacy-db.mjs <data-directory> <new-output-file>');
const root = path.resolve(directory);
const target = path.resolve(output);
if (target === path.join(root, 'database.json') || target === path.join(root, 'database.v1-backup.json')) {
  throw new Error('Export to a new file, outside the live database and migration backup');
}
const { storageVersion, ...data } = JSON.parse(fs.readFileSync(path.join(root, 'database.json'), 'utf8'));
if (storageVersion != null && storageVersion !== 2) throw new Error('Unsupported database version');
const loaded = new Map();
function fullTrip(stored) {
  const { receiptImagesRef: ref, ...trip } = stored;
  if (!ref) return trip;
  if (!/^[a-f0-9]{64}$/.test(ref)) throw new Error('Invalid photo reference');
  if (!loaded.has(ref)) {
    const encoded = fs.readFileSync(path.join(root, 'receipt-photos', `${ref}.json`), 'utf8');
    if (createHash('sha256').update(encoded).digest('hex') !== ref) throw new Error('Damaged photo file');
    loaded.set(ref, JSON.parse(encoded));
  }
  return { ...trip, receiptImages: loaded.get(ref) };
}
const result = {
  ...data,
  trips: Object.fromEntries(Object.entries(data.trips).map(([id, trip]) => [id, fullTrip(trip)])),
  history: data.history.map(fullTrip),
};
fs.writeFileSync(target, JSON.stringify(result), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log(`Exported complete trips and photos to ${target}`);
