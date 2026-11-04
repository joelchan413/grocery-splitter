'use client';

import React, { useRef, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Trip, Household } from '@/types';
import { useModalDialog } from '@/hooks/useModalDialog';
import { Avatar } from './Avatar';
import { formatRunDate } from './ScannerHome';
import { TripQrCode } from './TripQrCode';

interface ShareTripModalProps {
  isOpen: boolean;
  trip: Trip;
  household: Household;
  onClose: () => void;
}

export function ShareTripModal({ isOpen, trip, household, onClose }: ShareTripModalProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/?trip=${encodeURIComponent(trip.id)}`;

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        aria-describedby="share-description"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" /* taste-skill-ignore: a dialog floats over the page */
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="share-title" className="text-xl font-semibold text-slate-900">Share this trip</h2>
            <p className="text-sm text-slate-500">
              {trip.storeName}, {formatRunDate(trip.date)}. Claims update live for everyone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sharing"
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center space-y-4">
          <p id="share-description" className="max-w-xs text-center text-sm text-slate-600">
            Roommates scan the code or open the link to claim their items on their own phones.
          </p>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <TripQrCode value={shareUrl} />
          </div>

          <div className="w-full">
            <label htmlFor="share-link" className="mb-1.5 block text-sm font-medium text-slate-700">
              Trip link
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 p-1.5">
              <input
                id="share-link"
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                aria-live="polite"
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-500 active:scale-95 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="w-full">
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              Roommates <span className="font-normal text-slate-500 num">({household.participants.length})</span>
            </h3>
            <ul className="grid grid-cols-2 gap-2">
              {household.participants.map((p) => {
                const isReady = trip.readyParticipantIds?.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar participant={p} size="sm" />
                      <span className="truncate font-medium text-slate-900">{p.name}</span>
                    </span>
                    {isReady ? (
                      <span className="flex flex-none items-center gap-0.5 text-xs font-medium text-positive">
                        <Check className="h-3 w-3" aria-hidden="true" /> Done
                      </span>
                    ) : (
                      <span className="flex-none text-xs text-slate-500">Claiming</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
