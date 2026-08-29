'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, Sparkles, Users } from 'lucide-react';
import { Household, Participant } from '@/types';

interface HouseholdModalProps {
  isOpen: boolean;
  household: Household;
  isFirstTime?: boolean;
  onClose: () => void;
  onSave: (updated: Household) => void;
}

const PRESET_EMOJIS = ['🛒', '🥑', '🧀', '☕', '🍕', '🥦', '🍎', '🥩', '🥐', '🌮', '🥗', '🍩'];
const PRESET_COLORS = [
  '#2563EB', // Blue
  '#059669', // Emerald
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#DC2626', // Red
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#4B5563', // Slate
];

export function HouseholdModal({
  isOpen,
  household,
  isFirstTime = false,
  onClose,
  onSave,
}: HouseholdModalProps) {
  const [name, setName] = useState(household.name);
  const [participants, setParticipants] = useState<Participant[]>(household.participants);

  useEffect(() => {
    setName(household.name);
    setParticipants(household.participants);
  }, [household, isOpen]);

  if (!isOpen) return null;

  const handleUpdateParticipant = (id: string, updates: Partial<Participant>) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const handleAddParticipant = () => {
    const newId = `p-${Date.now()}`;
    const nextEmoji = PRESET_EMOJIS[participants.length % PRESET_EMOJIS.length];
    const nextColor = PRESET_COLORS[participants.length % PRESET_COLORS.length];
    setParticipants((prev) => [
      ...prev,
      {
        id: newId,
        name: `Roommate ${prev.length + 1}`,
        avatarEmoji: nextEmoji,
        color: nextColor,
        venmoHandle: '',
      },
    ]);
  };

  const handleRemoveParticipant = (id: string) => {
    if (participants.length <= 2) {
      alert('Household must have at least 2 participants.');
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a household name.');
      return;
    }
    onSave({
      ...household,
      name: name.trim(),
      participants,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            {isFirstTime && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 mb-2">
                <Sparkles className="h-3 w-3" /> Initial Setup Wizard
              </span>
            )}
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              {isFirstTime ? 'Welcome! Set Up Your Household' : 'Household Setup'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isFirstTime
                ? 'Configure your roommates and their Venmo handles for automatic split calculations.'
                : 'Manage your roommates and their Venmo handles for automatic payment links.'}
            </p>
          </div>
          {!isFirstTime && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-5 space-y-4">
          {/* Household Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Household / Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apartment 4B"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Roommates List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Roommates ({participants.length})
              </label>
              <button
                type="button"
                onClick={handleAddParticipant}
                className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Roommate</span>
              </button>
            </div>

            <div className="space-y-3">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-2">
                    {/* Emoji Selector */}
                    <div className="relative">
                      <select
                        aria-label={`Avatar Emoji for ${p.name}`}
                        value={p.avatarEmoji}
                        onChange={(e) => handleUpdateParticipant(p.id, { avatarEmoji: e.target.value })}
                        className="h-10 w-10 appearance-none rounded-xl border border-slate-300 bg-white text-center text-lg shadow-xs focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 cursor-pointer"
                      >
                        {PRESET_EMOJIS.map((emoji) => (
                          <option key={emoji} value={emoji}>
                            {emoji}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Roommate Name */}
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => handleUpdateParticipant(p.id, { name: e.target.value })}
                      placeholder="Name"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />

                    {/* Color Swatch */}
                    <input
                      type="color"
                      aria-label={`Theme color for ${p.name}`}
                      value={p.color}
                      onChange={(e) => handleUpdateParticipant(p.id, { color: e.target.value })}
                      className="h-9 w-9 cursor-pointer rounded-xl border border-slate-300 bg-transparent p-0.5 dark:border-slate-700"
                      title="Theme Color"
                    />

                    {/* Delete button */}
                    {participants.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(p.id)}
                        className="p-2 text-slate-400 hover:text-red-500 cursor-pointer"
                        title="Remove roommate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Venmo Handle */}
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-xs font-bold text-slate-400">Venmo:</span>
                    <input
                      type="text"
                      value={p.venmoHandle}
                      onChange={(e) => handleUpdateParticipant(p.id, { venmoHandle: e.target.value })}
                      placeholder="@username (optional)"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          {isFirstTime ? (
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Use Defaults
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>{isFirstTime ? 'Save & Start Splitting' : 'Save Household'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
