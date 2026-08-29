'use client';

import React, { useState } from 'react';
import { X, Key, ShieldCheck, Check, Sparkles, FileCode } from 'lucide-react';
import { loadGeminiApiKey, saveGeminiApiKey } from '@/lib/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(() => loadGeminiApiKey());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    saveGeminiApiKey(apiKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Settings</h2>
              <p className="text-xs text-slate-500">Receipt OCR & Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* .env.local recommendation */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex items-start gap-2.5">
              <FileCode className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-bold text-emerald-900 dark:text-emerald-300 block mb-0.5">
                  Recommended: Environment File
                </span>
                You can add your key to <code className="rounded bg-emerald-100/80 px-1.5 py-0.5 font-mono text-[11px] text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">.env.local</code>:
                <pre className="mt-1.5 rounded-lg bg-slate-900 p-2 font-mono text-[11px] text-emerald-400 dark:bg-slate-950">
                  GEMINI_API_KEY=your_key_here
                </pre>
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Or Override In-Browser Key</span>
              <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Gemini 3.7 Flash
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... (optional if in .env.local)"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              If left blank, the app will automatically use the <code className="font-mono text-[11px]">GEMINI_API_KEY</code> from your <code className="font-mono text-[11px]">.env.local</code> file.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Privacy & Security:</strong> <code className="font-mono text-[11px]">.env.local</code> is ignored by git so your API keys will never be accidentally committed to source control.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all"
          >
            {savedSuccess ? (
              <>
                <Check className="h-4 w-4" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
