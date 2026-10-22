import type { Trip } from '@/types';
import { createZip, type ZipEntry } from '@/lib/zip';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Keeps the receipt_id recognisable while making it safe as a file name on any OS. */
function safeFileStem(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'receipt';
}

export interface ReceiptPhotoFiles {
  files: ZipEntry[];
  skipped: number;
}

/**
 * Decodes each trip's saved photos into `receipt_photos/<receipt_id>_<n>.<ext>`.
 * Photos that are not embedded images are skipped and counted, never guessed at.
 */
export function collectReceiptPhotos(trips: readonly Trip[]): ReceiptPhotoFiles {
  const files: ZipEntry[] = [];
  const used = new Set<string>();
  let skipped = 0;

  for (const trip of trips) {
    const stem = safeFileStem(trip.id);
    (trip.receiptImages ?? []).forEach((image, index) => {
      const match = typeof image === 'string' ? DATA_URL.exec(image) : null;
      if (!match) {
        skipped += 1;
        return;
      }
      const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      let name = `receipt_photos/${stem}_${index + 1}.${extension}`;
      // Two ids can sanitise to the same stem; never let one photo overwrite another.
      for (let copy = 2; used.has(name); copy += 1) name = `receipt_photos/${stem}_${index + 1}_${copy}.${extension}`;
      used.add(name);
      try {
        files.push({ name, data: decodeBase64(match[2]) });
      } catch {
        used.delete(name);
        skipped += 1;
      }
    });
  }
  return { files, skipped };
}

/** A ZIP holding the unchanged CSV plus the photos of the exported trips. */
export function buildExportZip(
  csvBytes: Uint8Array,
  trips: readonly Trip[]
): { zip: Uint8Array; photoCount: number; skippedPhotos: number } {
  const { files, skipped } = collectReceiptPhotos(trips);
  return {
    zip: createZip([{ name: 'receipts.csv', data: csvBytes }, ...files]),
    photoCount: files.length,
    skippedPhotos: skipped,
  };
}
