'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck } from 'lucide-react';
import { useModalDialog } from '@/hooks/useModalDialog';

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

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, isOpen, onClose);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" /* taste-skill-ignore: a dialog floats over the page */>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 id="settings-title" className="text-xl font-semibold text-slate-900">Settings</h2>
            <p className="text-sm text-slate-500">Receipt scanning</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="cursor-pointer rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">Receipt scanner</p>
            <p className="mt-1 text-base font-medium text-slate-900">Codex CLI</p>
            <div role="status" aria-live="polite" className="mt-2 text-sm text-slate-600">
              {error || status?.message || 'Checking the scanner connection…'}
            </div>
            {status && !error && <p className="mt-2 text-sm text-slate-500">Model: {status.model}</p>}
            <button type="button" onClick={() => { setStatus(null); setError(null); setRefresh((value) => value + 1); }} className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-slate-900 hover:text-accent">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check connection
            </button>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p>The household administrator manages the scanner login on the server. Receipt photos are sent to OpenAI for extraction.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-500">Close</button>
        </div>
      </div>
    </div>
  );
}
