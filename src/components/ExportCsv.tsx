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
    'w-full min-w-0 sm:w-auto rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none';
  const labelClass = 'min-w-0 text-sm font-medium text-slate-600';

  return (
    <section aria-labelledby="export-title" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 id="export-title" className="mb-3 text-base font-medium text-slate-900">Export to CSV</h2>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className={`col-span-2 ${labelClass}`}>
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
        <label className={labelClass}>
          From
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <label className={labelClass}>
          To
          <input
            type="date"
            value={range.end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 sm:pb-2.5">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-4 w-4 shrink-0 cursor-pointer accent-primary-600"
          />
          <span>Include receipt photos (downloads a .zip)</span>
        </label>
        <button
          type="button"
          onClick={handleExport}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-500 cursor-pointer"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Export CSV</span>
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        {me
          ? `Purchases ${me.name} paid for or has a share of, by purchase date. Hidden and unchecked runs are left out. Photos are named by receipt_id.`
          : 'Choose whose purchases and shares to export.'}
      </p>
      {message && (
        <p
          role="status"
          className={`mt-2 text-sm font-medium ${message.isError ? 'text-red-700' : 'text-positive'}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
