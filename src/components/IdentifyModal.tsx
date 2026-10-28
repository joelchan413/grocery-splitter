'use client';

import React, { useRef } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';
import { Household } from '@/types';
import { Avatar } from './Avatar';

interface IdentifyModalProps {
  isOpen: boolean;
  household: Household;
  onSelect: (participantId: string) => void;
}

export function IdentifyModal({ isOpen, household, onSelect }: IdentifyModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="identify-title"
        aria-describedby="identify-description"
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" /* taste-skill-ignore: a dialog floats over the page */
      >
        <h2 id="identify-title" className="text-xl font-semibold text-slate-900">
          Who are you?
        </h2>
        <p id="identify-description" className="text-sm text-slate-500 mt-1 mb-5">
          Choose yourself in <span className="font-medium text-slate-900">{household.name}</span> to claim your items on this phone.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {household.participants.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white p-3.5 hover:border-slate-900 active:scale-95 transition-colors cursor-pointer"
            >
              <Avatar participant={p} size="lg" />
              <span className="text-base font-medium text-slate-900">{p.name}</span>
              {p.venmoHandle && <span className="text-sm text-slate-500">{p.venmoHandle}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
