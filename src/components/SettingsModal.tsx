'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck, Bell, BellOff } from 'lucide-react';
import { useModalDialog } from '@/hooks/useModalDialog';
import type { PushNotifications } from '@/hooks/usePushNotifications';
import type { Household } from '@/types';

interface ScannerStatus {
  installed: boolean;
  authenticated: boolean;
  model: string;
  message: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  push: PushNotifications;
  household: Household;
  /** Who this device last claimed as: the starting choice for whose notifications it gets. */
  defaultParticipantId: string;
}

const PUSH_EXPLANATIONS: Record<Exclude<PushNotifications['status'], 'on' | 'off'>, string> = {
  loading: 'Checking this device…',
  unsupported: 'This browser can’t receive notifications. Try Chrome, Firefox or Safari.',
  'needs-install': 'On iPhone and iPad, notifications only work from the home screen. Tap Share, then “Add to Home Screen”, and open GrocerySplit from there.',
  'not-configured': 'The household administrator needs to set up notification keys on the server first.',
  denied: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then come back here.',
};

const selectClass =
  'mt-1 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-medium text-slate-900 focus:border-slate-900 focus:outline-none sm:text-sm';

function NotificationSettings({ push, household, defaultParticipantId }: Pick<SettingsModalProps, 'push' | 'household' | 'defaultParticipantId'>) {
  const { status, busy, error, enable, disable } = push;
  const people = household.participants;
  const linked = people.find((p) => p.id === push.participantId);
  const [chosenId, setChosenId] = useState(() =>
    people.some((p) => p.id === defaultParticipantId) ? defaultParticipantId : people[0]?.id ?? ''
  );
  const available = status === 'on' || status === 'off';

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm text-slate-500">Notifications</p>
      <p className="mt-1 text-base font-medium text-slate-900">
        {status === 'on' ? `On for ${linked?.name ?? 'a former roommate'}` : status === 'off' ? 'Off on this device' : 'Not available'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {available
          ? 'New trips, when everyone’s done claiming, payments you receive, and reminders to claim and pay.'
          : PUSH_EXPLANATIONS[status]}
      </p>
      {available && people.length > 0 && (
        <label className="mt-3 block text-sm font-medium text-slate-600">
          This phone belongs to
          <select
            value={status === 'on' ? push.participantId ?? '' : chosenId}
            disabled={busy}
            onChange={(e) => {
              setChosenId(e.target.value);
              if (status === 'on') enable(e.target.value);
            }}
            className={selectClass}
          >
            {status === 'on' && !linked && <option value={push.participantId ?? ''} disabled>Choose a roommate</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {status === 'off' && people.length > 0 && (
        <button type="button" onClick={() => enable(chosenId)} disabled={busy || !chosenId} className="btn btn-primary btn-sm mt-3">
          <Bell className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
      {status === 'on' && (
        <button type="button" onClick={disable} disabled={busy} className="btn btn-secondary btn-sm mt-3">
          <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Turning off…' : 'Turn off on this device'}
        </button>
      )}
    </div>
  );
}

export function SettingsModal({ isOpen, onClose, push, household, defaultParticipantId }: SettingsModalProps) {
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
            <p className="text-sm text-slate-500">Notifications and receipt scanning</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="btn btn-quiet btn-icon -mr-2 -mt-1">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <NotificationSettings push={push} household={household} defaultParticipantId={defaultParticipantId} />
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">Receipt scanner</p>
            <p className="mt-1 text-base font-medium text-slate-900">Codex CLI</p>
            <div role="status" aria-live="polite" className="mt-2 text-sm text-slate-600">
              {error || status?.message || 'Checking the scanner connection…'}
            </div>
            {status && !error && <p className="mt-2 text-sm text-slate-500">Model: {status.model}</p>}
            <button type="button" onClick={() => { setStatus(null); setError(null); setRefresh((value) => value + 1); }} className="btn btn-secondary btn-sm mt-3">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check connection
            </button>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p>The household administrator manages the scanner login on the server. Receipt photos are sent to OpenAI for extraction.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}
