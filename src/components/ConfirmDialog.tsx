'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger paints the confirm button red, for changes that undo recorded work. */
  tone?: 'default' | 'danger';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** Asks a yes-or-no question in the app's own dialog, in place of the browser's confirm(). */
export function useConfirm() {
  return useContext(ConfirmContext);
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A newer question replaces an unanswered one, which counts as a no.
        current.current?.resolve(false);
        current.current = { ...options, resolve };
        setRequest(current.current);
      }),
    []
  );

  const answer = useCallback((ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    setRequest(null);
  }, []);

  // Back or Forward underneath an open question answers it with no, since the screen it asked about is gone.
  useEffect(() => {
    if (!request) return;
    const onPopState = () => answer(false);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [request, answer]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog request={request} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onAnswer }: { request: Request; onAnswer: (ok: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Cancel comes first, so Enter on the first focused control never confirms by accident.
  useModalDialog(dialogRef, true, () => onAnswer(false));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => onAnswer(false)}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={request.body ? 'confirm-body' : undefined}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-[20px] border border-slate-200 bg-white p-6 shadow-2xl" /* taste-skill-ignore: a dialog floats over the page */
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">{request.title}</h2>
        {request.body && <p id="confirm-body" className="mt-2 text-[15px] leading-relaxed text-slate-500">{request.body}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onAnswer(false)} className="btn btn-secondary">
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={`btn ${request.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
