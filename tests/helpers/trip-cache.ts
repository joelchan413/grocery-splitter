import type { Page } from '@playwright/test';
import type { Trip } from '../../src/types';

export async function readCachedTrip(page: Page): Promise<Trip | null> {
  return page.evaluate(async () => {
    const raw = localStorage.getItem('grocery_splitter_active_trip_v1');
    if (!raw) return null;
    const pointer = JSON.parse(raw);
    if (!pointer.receiptImagesOmitted) return pointer;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-splitter-cache', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Trip | null>((resolve, reject) => {
        const tx = db.transaction(['trips', 'photos'], 'readonly');
        let result: Trip | null = null;
        const request = tx.objectStore('trips').get(pointer.id);
        request.onsuccess = () => {
          const stored = request.result;
          if (!stored) return;
          const { photoKey, revisionFloor, ...trip } = stored;
          void revisionFloor;
          if (photoKey === null) result = { ...trip, receiptImages: [] };
          else {
            const photos = tx.objectStore('photos').get(photoKey);
            photos.onsuccess = () => { result = { ...trip, receiptImages: photos.result }; };
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}

export async function photoRecordCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-splitter-cache', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('photos').objectStore('photos').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}
