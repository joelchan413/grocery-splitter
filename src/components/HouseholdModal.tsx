'use client';

import React, { useRef, useState } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';
import { Household, Participant } from '@/types';
import { useModalDialog } from '@/hooks/useModalDialog';
import { Avatar } from './Avatar';

interface HouseholdModalProps {
  isOpen: boolean;
  household: Household;
  isFirstTime?: boolean;
  onClose: () => void;
  onSave: (updated: Household) => void;
}

// Emoji only appear in the copied group-chat summary, never in the interface.
const PRESET_EMOJIS = ['🛒', '🥑', '🧀', '☕', '🍕', '🥦', '🍎', '🥩', '🥐', '🌮', '🥗', '🍩']; // taste-skill-ignore: group-chat text only
// Roommate colours are the user's own identity data, in order so neighbours sit at least 60 degrees apart.
const PRESET_COLORS = [
  '#2563EB', // Blue  taste-skill-ignore: a default roommate colour the user can change
  '#059669', // Emerald
  '#D97706', // Amber
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#65A30D', // Lime
  '#DC2626', // Red
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

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, isOpen, isFirstTime ? undefined : onClose);

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
      alert('A household needs at least 2 roommates.');
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Enter a household name.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-title"
        aria-describedby="household-description"
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" /* taste-skill-ignore: a dialog floats over the page */
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="household-title" className="text-xl font-semibold text-slate-900">
              {isFirstTime ? 'Set up your household' : 'Household'}
            </h2>
            <p id="household-description" className="text-sm text-slate-500 mt-1">
              {isFirstTime
                ? 'Add your roommates and their Venmo handles so each split comes with a payment link.'
                : 'Roommates, their colours and their Venmo handles.'}
            </p>
          </div>
          {!isFirstTime && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="household-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Household name
            </label>
            <input
              id="household-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apartment 4B"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-700">
                Roommates <span className="font-normal text-slate-500 num">({participants.length})</span>
              </h3>
              <button
                type="button"
                onClick={handleAddParticipant}
                className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add roommate</span>
              </button>
            </div>

            <ul className="space-y-3">
              {participants.map((p, index) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center gap-2">
                    <Avatar participant={p} size="lg" />

                    <input
                      type="text"
                      aria-label={`Name of roommate ${index + 1}`}
                      value={p.name}
                      onChange={(e) => handleUpdateParticipant(p.id, { name: e.target.value })}
                      placeholder="Name"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-medium text-slate-900 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none"
                    />

                    <input
                      type="color"
                      aria-label={`Colour for ${p.name || `roommate ${index + 1}`}`}
                      value={/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PRESET_COLORS[index % PRESET_COLORS.length]}
                      onChange={(e) => handleUpdateParticipant(p.id, { color: e.target.value })}
                      className="h-10 w-10 flex-none cursor-pointer rounded-xl border border-slate-300 bg-white p-1"
                      title="Colour"
                    />

                    {participants.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(p.id)}
                        aria-label={`Remove ${p.name || `roommate ${index + 1}`}`}
                        className="rounded-full p-2 text-slate-500 hover:bg-white hover:text-red-700 cursor-pointer"
                        title="Remove roommate"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <label className="flex items-center gap-2 pl-12">
                    <span className="text-sm text-slate-600">Venmo</span>
                    <input
                      type="text"
                      value={p.venmoHandle}
                      onChange={(e) => handleUpdateParticipant(p.id, { venmoHandle: e.target.value })}
                      placeholder="@username (optional)"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          {isFirstTime ? (
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Use defaults
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-500 transition-colors cursor-pointer"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{isFirstTime ? 'Save and start splitting' : 'Save household'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
