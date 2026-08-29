'use client';

import React from 'react';
import { UserCheck, Sparkles } from 'lucide-react';
import { Household, Participant } from '@/types';

interface IdentifyModalProps {
  isOpen: boolean;
  household: Household;
  onSelect: (participantId: string) => void;
}

export function IdentifyModal({ isOpen, household, onSelect }: IdentifyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 mb-3 shadow-inner">
          <UserCheck className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          Who Are You?
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
          Select your roommate profile in <strong className="text-slate-800 dark:text-slate-200">{household.name}</strong> to start claiming items on your phone.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {household.participants.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 hover:border-emerald-500 hover:bg-emerald-50/50 active:scale-95 transition-all dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 cursor-pointer shadow-xs"
            >
              <span className="text-3xl">{p.avatarEmoji}</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {p.name}
              </span>
              {p.venmoHandle && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {p.venmoHandle}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
