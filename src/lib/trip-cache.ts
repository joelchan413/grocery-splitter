import type { Trip } from '@/types';
import { sameReceiptImages } from '@/lib/trip-sync';

// Photos are immutable records. A trip's small metadata points to its photo key,
// and both are committed in the same transaction. Claims reuse the photo record.
const DB_NAME = 'grocery-splitter-cache';
let opening: Promise<IDBDatabase> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const lastPhotos = new Map<string, { images: WeakRef<string[]>; key: IDBValidKey }>();
const savedPhotos = new WeakMap<string[], IDBValidKey>();
const pendingTrips = new WeakMap<Trip, Promise<void>>();
const pendingAuthoritativeTrips = new WeakMap<Trip, Promise<void>>();

export interface CacheTripOptions {
  // Explicitly opened or already accepted UI state may replace an older cache
  // even when timestamps come from different device clocks.
  authoritative?: boolean;
}

function openCache(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('trips', { keyPath: 'id' });
        request.result.createObjectStore('photos', { autoIncrement: true });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Local cache is blocked by another page'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch((error) => { opening = undefined; throw error; });
  }
  return opening;
}

interface CachedTrip extends Omit<Trip, 'receiptImages'> {
  photoKey: IDBValidKey | null;
  revisionFloor?: number;
}

export function cacheTrip(trip: Trip, { authoritative = false }: CacheTripOptions = {}): Promise<void> {
  if (trip.receiptImagesOmitted) return Promise.resolve();
  const pending = authoritative ? pendingAuthoritativeTrips : pendingTrips;
  const existing = pending.get(trip);
  if (existing) return existing;
  const save = queue.catch(() => {}).then(async () => {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['trips', 'photos'], 'readwrite');
      const { receiptImages: images = [], receiptImagesOmitted, ...metadata } = trip;
      void receiptImagesOmitted;
      let committedPhotoKey: IDBValidKey | undefined;
      const current = tx.objectStore('trips').get(trip.id);
      current.onsuccess = () => {
        const timestamp = (value: Pick<Trip, 'updatedAt' | 'createdAt' | 'date'>) => {
          const parsed = Date.parse(value.updatedAt || value.createdAt || value.date || '');
          return Number.isFinite(parsed) ? parsed : 0;
        };
        // This check belongs inside the same transaction as the replacement:
        // legacy migration continuations and other tabs can enqueue older saves.
        const stored: CachedTrip | undefined = current.result;
        const currentTime = stored ? timestamp(stored) : 0;
        const incomingTime = timestamp(trip);
        const revisionFloor = Math.max(currentTime, stored?.revisionFloor ?? 0);
        if (!authoritative && (currentTime > incomingTime || (revisionFloor > currentTime && incomingTime <= revisionFloor))) return;
        let photoKey = savedPhotos.get(images);
        const previous = lastPhotos.get(trip.id);
        const previousImages = previous?.images.deref();
        if (photoKey === undefined && previousImages && sameReceiptImages(images, previousImages)) photoKey = previous!.key;
        const putMetadata = (key: IDBValidKey | null) => {
          tx.objectStore('trips').put({ ...metadata, photoKey: key, revisionFloor: Math.max(revisionFloor, incomingTime) });
          if (key !== null) committedPhotoKey = key;
        };
        if (!images.length) putMetadata(null);
        else if (photoKey !== undefined) putMetadata(photoKey);
        else {
          const addPhotos = () => {
            const added = tx.objectStore('photos').add(images);
            added.onsuccess = () => putMetadata(added.result);
          };
          // Cold sessions have no WeakMap hits. Compare against the persisted
          // photo set before allocating another multi-megabyte record.
          if (stored?.photoKey != null) {
            const existingPhotos = tx.objectStore('photos').get(stored.photoKey);
            existingPhotos.onsuccess = () => {
              if (Array.isArray(existingPhotos.result) && sameReceiptImages(images, existingPhotos.result)) putMetadata(stored.photoKey);
              else addPhotos();
            };
          } else addPhotos();
        }
      };
      tx.oncomplete = () => {
        if (committedPhotoKey !== undefined) {
          savedPhotos.set(images, committedPhotoKey);
          lastPhotos.set(trip.id, { images: new WeakRef(images), key: committedPhotoKey });
        }
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error('Local cache write was aborted'));
      tx.onerror = () => {}; // onabort reports transaction failures, including quota errors.
    });
  });
  queue = save;
  pending.set(trip, save);
  // Deduplicate only in-flight work. A completed promise says nothing about
  // which revision another transaction or tab subsequently stored for this id.
  void save.then(() => pending.delete(trip), () => pending.delete(trip));
  return save;
}

export async function loadCachedTrip(id: string): Promise<Trip | null> {
  await queue.catch(() => {});
  const db = await openCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['trips', 'photos'], 'readonly');
    const request = tx.objectStore('trips').get(id);
    let result: Trip | null = null;
    request.onsuccess = () => {
      const stored: CachedTrip | undefined = request.result;
      if (!stored) return;
      const { photoKey, revisionFloor, ...trip } = stored;
      void revisionFloor;
      if (photoKey === null) result = { ...trip, receiptImages: [] };
      else {
        const photos = tx.objectStore('photos').get(photoKey);
        photos.onsuccess = () => {
          if (Array.isArray(photos.result)) {
            result = { ...trip, receiptImages: photos.result };
            savedPhotos.set(result.receiptImages, photoKey);
            lastPhotos.set(id, { images: new WeakRef(result.receiptImages), key: photoKey });
          }
        };
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('Local cache read was aborted'));
    tx.onerror = () => {};
  });
}
