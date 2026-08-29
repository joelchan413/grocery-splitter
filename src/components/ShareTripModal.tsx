'use client';

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, Smartphone, Users, Radio, Sparkles } from 'lucide-react';
import { Trip, Household } from '@/types';

interface ShareTripModalProps {
  isOpen: boolean;
  trip: Trip;
  household: Household;
  onClose: () => void;
}

export function ShareTripModal({ isOpen, trip, household, onClose }: ShareTripModalProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/?trip=${encodeURIComponent(trip.id)}`;
      setShareUrl(url);
    }
  }, [trip.id]);

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

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    shareUrl
  )}&margin=10`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-slate-900 dark:text-white">Share Live Trip</h2>
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-500">{trip.storeName} ({trip.date})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-5 flex flex-col items-center text-center space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs">
            Roommates can scan this QR code or click the link to claim items on their own phones in real time!
          </p>

          {/* QR Code Card */}
          <div className="rounded-3xl border-2 border-dashed border-emerald-300 bg-white p-4 shadow-md dark:border-emerald-700 dark:bg-white">
            <img
              src={qrImageUrl}
              alt="Scan QR code to join trip"
              className="h-48 w-48 rounded-xl object-contain mx-auto"
            />
          </div>

          {/* Share Link Box */}
          <div className="w-full">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left mb-1.5">
              Room Link
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/80">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent px-2 text-xs font-mono text-slate-800 focus:outline-none dark:text-slate-200"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Roommates Checklist */}
          <div className="w-full rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-left">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Connected Household Roster ({household.participants.length})
            </span>
            <div className="grid grid-cols-2 gap-2">
              {household.participants.map((p) => {
                const isReady = trip.readyParticipantIds?.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-white px-2.5 py-1.5 text-xs shadow-2xs border border-slate-200/70 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span>{p.avatarEmoji}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {p.name}
                      </span>
                    </div>
                    {isReady ? (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">Claiming</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
