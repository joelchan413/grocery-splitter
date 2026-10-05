'use client';

import React, { useEffect, useState } from 'react';
import { X, Cpu, RefreshCw, ShieldCheck } from 'lucide-react';

interface ScannerStatus {
  installed: boolean;
  authenticated: boolean;
  model: string;
  message: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch('/api/scan-receipt', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not check the receipt scanner. Please retry.');
        const nextStatus: ScannerStatus = await response.json();
        if (!controller.signal.aborted) { setStatus(nextStatus); setError(null); }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not check the receipt scanner. Please retry.');
      });
    return () => controller.abort();
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 id="settings-title" className="text-base font-bold text-slate-900 dark:text-white">Settings</h2>
              <p className="text-xs text-slate-500">Receipt scanning</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">AI Receipt Scanner</p>
            <p className="mt-2 font-bold text-slate-900 dark:text-white">Codex CLI</p>
            <div role="status" aria-live="polite" className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {error || status?.message || 'Checking scanner connection...'}
            </div>
            {status && !error && <p className="mt-2 text-xs text-slate-500">Model: {status.model}</p>}
            <button type="button" onClick={() => { setStatus(null); setError(null); setRefresh((value) => value + 1); }} className="mt-3 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <RefreshCw className="h-3.5 w-3.5" /> Check connection
            </button>
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>The household administrator manages the scanner login on the server. Receipt photos are sent to OpenAI for extraction.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500">Close</button>
        </div>
      </div>
    </div>
  );
}
