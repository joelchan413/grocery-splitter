'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Household, Trip } from '@/types';
import { defaultExportRange, exportTripsToCsv } from '@/lib/export-csv';
import { buildExportZip } from '@/lib/export-photos';

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface ExportCsvProps {
  history: Trip[];
  household: Household;
  participantId?: string;
}

export function ExportCsv({ history, household, participantId }: ExportCsvProps) {
  const [range, setRange] = useState(() => defaultExportRange());
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [includePhotos, setIncludePhotos] = useState(false);

  // Defaults to who this device is identified as; choosing here only affects the export.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const exportAsId = chosenId ?? participantId ?? '';
  const me = household.participants.find((p) => p.id === exportAsId);

  const handleExport = () => {
    const result = exportTripsToCsv(history, household, exportAsId, range.start, range.end);
    if (!result.ok) {
      setMessage({ text: result.error, isError: true });
      return;
    }

    // The BOM makes Excel read the file as UTF-8 so accented store names survive.
    const csvBytes = new TextEncoder().encode(`﻿${result.csv}`);
    const baseName = `grocery-export_${range.start}_to_${range.end}`;
    let photoNote = '';
    try {
      if (includePhotos) {
        const { zip, photoCount, skippedPhotos } = buildExportZip(csvBytes, result.trips);
        downloadFile(new Blob([zip as BlobPart], { type: 'application/zip' }), `${baseName}.zip`);
        photoNote = ` with ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`;
        if (skippedPhotos) {
          photoNote += ` (${skippedPhotos} ${skippedPhotos === 1 ? 'photo' : 'photos'} could not be read and ${skippedPhotos === 1 ? 'was' : 'were'} skipped)`;
        }
      } else {
        downloadFile(new Blob([csvBytes as BlobPart], { type: 'text/csv;charset=utf-8' }), `${baseName}.csv`);
      }
    } catch (err) {
      console.error('Export failed:', err);
      setMessage({ text: 'The export could not be created. Try again without photos.', isError: true });
      return;
    }

    const rows = `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}`;
    const skipped = result.skippedUndated
      ? ` ${result.skippedUndated} ${result.skippedUndated === 1 ? 'trip was' : 'trips were'} skipped for lacking a valid date.`
      : '';
    setMessage({
      text: `Exported ${rows}${photoNote} as ${me?.name ?? 'unknown'} for ${range.start} to ${range.end}.${skipped}`,
      isError: false,
    });
  };

  const inputClass =
    'w-full min-w-0 sm:w-auto rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:[color-scheme:dark]';

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="col-span-2 min-w-0 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Export as
          <select
            value={me ? exportAsId : ''}
            onChange={(e) => {
              setChosenId(e.target.value);
              setMessage(null);
            }}
            className={`mt-1 block ${inputClass}`}
          >
            {!me && (
              <option value="" disabled>
                Choose a roommate
              </option>
            )}
            {household.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          From
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          To
          <input
            type="date"
            value={range.end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs font-semibold text-slate-700 sm:pb-2 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
          />
          <span>Include receipt photos (downloads a .zip)</span>
        </label>
        <button
          type="button"
          onClick={handleExport}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:py-2 font-bold text-white shadow-sm hover:bg-emerald-500 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {me
          ? `Purchases ${me.name} paid for or has a share of, by purchase date. Hidden and unchecked trips are left out. Photos are named by receipt_id.`
          : 'Choose whose purchases and shares to export.'}
      </p>
      {message && (
        <p
          role="status"
          className={`mt-2 text-xs font-semibold ${
            message.isError ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
