# Performance and storage

Receipt photos are stored once, outside the frequently rewritten trip metadata.
Server metadata remains an atomic JSON file; this is a single-process household
app, not a multi-writer database. Small metadata writes are still synchronous.

## Server storage migration

New saves use `storageVersion: 2` in `data/database.json`, with photo arrays in
`data/receipt-photos/<sha256>.json`. The API still returns complete trips with the
original photo data. The first save of an old database preserves its exact bytes
in `data/database.v1-backup.json`. Photos are written atomically before metadata
references them. New photo files and their directory entries are flushed with
`fsync` before the metadata commit; metadata writes still provide atomic rename
rather than full host-power-loss durability. A failed write does not replace the committed database or emit
an update. Missing or damaged photo files cause an error, never a reset.

Back up and restore the **entire data directory**, including `receipt-photos`.
The existing redeployment script already archives the whole directory. There is
no automatic deletion of old photo files, so backups and older snapshots retain
their photo references.

This changes the on-disk format. After the first version-2 write, an older image
cannot read the new photo references. Deploy this migration separately from
changes that depend on automatic old-image rollback. To prepare a current,
compatible database for an older release, stop writes and run:

```sh
node scripts/export-legacy-db.mjs /path/to/data /private/path/database-legacy.json
```

The exporter checks photo hashes, preserves all current trip/household/payment
records, and refuses to overwrite the live file, migration backup, or any existing
output. With the app stopped, retain a complete backup and use this export as the
older release's `data/database.json`. The migration backup represents the moment
of migration; restoring it alone would discard later changes.

## Browser cache

IndexedDB stores complete offline snapshots and immutable photo records in one
transaction. Repeated claim edits reuse the same photo record. Fresh sessions
compare the persisted photo set before allocating a record, so reopening an
unchanged receipt does not consume more photo storage. localStorage holds
only small active-trip and history summaries. Legacy embedded caches remain until
their IndexedDB copies have committed, including if a history refresh arrives
during migration. Failed migrations leave the embedded source intact. When the API is unreachable and the screen code has loaded,
history opens the last complete snapshot cached on that device. IndexedDB checks
revision timestamps inside each write transaction so a delayed migration or an
older tab cannot replace a newer snapshot. Promise deduplication covers only
in-flight writes. Deliberately opened server snapshots and UI updates which
passed the page's stale-message guard may authoritatively replace cached state;
a retained revision floor prevents delayed background migrations from undoing
that choice even when device clocks differ. Local edits and archiving advance
past the observed revision rather than depending only on the device clock. History publication remerges the latest localStorage list to
preserve saves completed by other tabs during photo persistence.

Photo arrays and trip objects are treated as immutable. Gallery images mount
only when opened, and the photo dialog opens after its controls render. Failed
deferred screen imports have a reload fallback after reconnecting. History initially renders 50 trips, with a button for the next
50; balances and exports still use the entire selected history. Settlement status
lookups are reused across filtering, combining balances and marking payments.

## Benchmark

Run from the repository root:

```sh
node scripts/benchmark-storage.mjs 168fca36eb7a83963bfeda44a4b01be6b48e38e5
```

The script creates and removes temporary fixtures; it never reads live data.
[storage-benchmark.json](storage-benchmark.json) records a local run with 50 trips,
20 items per trip, and 256 KiB of photo data per trip. Twelve steady-state claim
updates are measured after migration and warm-up. The baseline is the specified
Git commit; the optimized version is the working copy.

These are synchronous server storage timings on this development machine. They
exclude migration, HTTP, OCR, physical mobile devices, browser input latency and
fsync guarantees. They establish the removal of photo-sized work from claim
saves, not a measured Core Web Vitals score or a universal performance rating.
