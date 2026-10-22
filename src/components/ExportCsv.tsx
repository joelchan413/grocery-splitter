'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Household, Trip } from '@/types';
import { defaultExportRange, exportTripsToCsv } from '@/lib/export-csv';

interface ExportCsvProps {
  history: Trip[];
  household: Household;
  participantId?: string;
}

export function ExportCsv({ history, household, participantId }: ExportCsvProps) {
  const [range, setRange] = useState(() => defaultExportRange());
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const me = household.participants.find((p) => p.id === participantId);

  const handleExport = () => {
    const result = exportTripsToCsv(history, household, participantId ?? '', range.start, range.end);
    if (!result.ok) {
      setMessage({ text: result.error, isError: true });
      return;
    }

    // The BOM makes Excel read the file as UTF-8 so accented store names survive.
    const blob = new Blob(['﻿', result.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grocery-export_${range.start}_to_${range.end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const rows = `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}`;
    const skipped = result.skippedUndated
      ? ` ${result.skippedUndated} ${result.skippedUndated === 1 ? 'trip was' : 'trips were'} skipped for lacking a valid date.`
      : '';
    setMessage({ text: `Exported ${rows} for ${range.start} to ${range.end}.${skipped}`, isError: false });
  };

  const inputClass =
    'rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:[color-scheme:dark]';

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          From
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          To
          <input
            type="date"
            value={range.end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className={`mt-1 block ${inputClass}`}
          />
        </label>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {me
          ? `Your purchases and shares as ${me.name}, by purchase date. Hidden and unchecked trips are left out.`
          : 'Choose who you are on a claiming screen to export your share.'}
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
