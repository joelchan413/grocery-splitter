'use client';

/* eslint-disable @next/next/no-img-element -- Saved data URLs have unknown dimensions and need no image optimization. */
import { useRef, useState } from 'react';
import { Download, ScanSearch, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Trip } from '@/types';

export function ReceiptPhotos({ trip }: { trip: Trip }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const images = trip.receiptImages || [];
  const filename = (index: number) => {
    const extension = images[index]?.match(/^data:image\/(jpeg|png|webp);/i)?.[1]?.toLowerCase() || 'jpg';
    const store = trip.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'receipt';
    return `${store}-${trip.date}-receipt-${index + 1}.${extension === 'jpeg' ? 'jpg' : extension}`;
  };
  const actionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950';

  return (
    <section aria-label="Saved receipt photos" className="mx-auto max-w-3xl px-4 pt-6">
      <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-600">
          Receipt photos ({images.length})
        </summary>
        {images.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400">No receipt photos were saved for this trip.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-3">
            {images.map((src, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  aria-label={`View receipt photo ${index + 1}`}
                  className="group block w-full cursor-pointer bg-slate-100 p-2 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:bg-slate-800"
                  onClick={() => {
                    setSelectedIndex(index);
                    setZoomed(false);
                    dialogRef.current?.showModal();
                  }}
                >
                  <img src={src} alt={`Receipt photo ${index + 1} from ${trip.storeName}`} loading="lazy" className="h-40 w-full object-contain" />
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 group-hover:text-emerald-700 dark:text-slate-300">
                    <ScanSearch className="h-4 w-4" aria-hidden="true" /> View photo {index + 1}
                  </span>
                </button>
                <a href={src} download={filename(index)} className={`${actionClass} w-full`} aria-label={`Download receipt photo ${index + 1}`}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Download
                </a>
              </div>
            ))}
          </div>
        )}
      </details>

      {images.length > 0 && <dialog
        ref={dialogRef}
        aria-labelledby="receipt-photo-title"
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <h2 id="receipt-photo-title" className="text-sm font-bold">Receipt photo {selectedIndex + 1} of {images.length}</h2>
          <div className="flex items-center gap-1">
            <button type="button" className={actionClass} onClick={() => setZoomed(!zoomed)} aria-pressed={zoomed}>
              {zoomed ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />}
              {zoomed ? 'Fit to width' : 'Actual size'}
            </button>
            <a href={images[selectedIndex]} download={filename(selectedIndex)} className={actionClass} aria-label={`Download receipt photo ${selectedIndex + 1}`}>
              <Download className="h-4 w-4" aria-hidden="true" /> Download
            </a>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close receipt photo" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-slate-800">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="overflow-auto bg-slate-100 p-3 dark:bg-slate-950">
          {images[selectedIndex] && <img src={images[selectedIndex]} alt={`Receipt photo ${selectedIndex + 1} from ${trip.storeName}`} className={`mx-auto h-auto ${zoomed ? 'max-w-none' : 'max-w-full'}`} />}
        </div>
      </dialog>}
    </section>
  );
}
