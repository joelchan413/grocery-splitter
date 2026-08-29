'use client';

import React, { useState, useRef } from 'react';
import { Camera, Upload, Sparkles, X, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { Household, Trip, LineItem } from '@/types';
import { SAMPLE_RECEIPTS, ParsedReceiptData } from '@/lib/gemini';
import { loadGeminiApiKey } from '@/lib/storage';

interface ReceiptScannerProps {
  household: Household;
  onTripScanned: (newTrip: Trip) => void;
}

export function ReceiptScanner({ household, onTripScanned }: ReceiptScannerProps) {
  const [selectedPayerId, setSelectedPayerId] = useState<string>(
    household.participants[0]?.id || 'p1'
  );
  const [images, setImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setErrorMessage(null);

    const files = Array.from(e.target.files);
    files.slice(0, 3 - images.length).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImages((prev) => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParseImages = async () => {
    if (images.length === 0) {
      setErrorMessage('Please upload or snap at least 1 receipt photo.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const customApiKey = loadGeminiApiKey();
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          apiKey: customApiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to scan receipt image.');
      }

      constructAndEmitTrip(data);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message || 'Error processing receipt. You can try another photo or use a sample receipt.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUseSample = (sample: typeof SAMPLE_RECEIPTS[0]) => {
    setIsProcessing(true);
    setTimeout(() => {
      constructAndEmitTrip(sample.data);
      setIsProcessing(false);
    }, 400);
  };

  const constructAndEmitTrip = (parsed: ParsedReceiptData) => {
    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      householdId: household.id,
      storeName: parsed.storeName || 'Grocery Store',
      date: parsed.date || new Date().toISOString().split('T')[0],
      payerId: selectedPayerId,
      items: parsed.items.map((it, idx) => ({
        ...it,
        id: it.id || `item-${Date.now()}-${idx}`,
      })),
      taxTotal: parsed.taxTotal || 0,
      basketDiscount: parsed.basketDiscount || 0,
      receiptImages: images,
      claims: {},
      readyParticipantIds: [],
      status: 'review',
      createdAt: new Date().toISOString(),
    };

    onTripScanned(newTrip);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header Info */}
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> AI Receipt Scanner
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          Scan Grocery Receipt
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Upload receipt photos to automatically extract items, prices, and taxability status.
        </p>
      </div>

      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Step 1: Who fronted the bill? */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
            1. Who paid at the grocery store?
          </label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {household.participants.map((p) => {
              const isSelected = selectedPayerId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPayerId(p.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-all ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20 dark:bg-emerald-950/40 dark:border-emerald-500'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/40'
                  }`}
                >
                  <span className="text-2xl">{p.avatarEmoji}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</span>
                  <span className="text-[10px] text-slate-400">
                    {isSelected ? '👑 Payer' : p.venmoHandle || 'Roommate'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Upload or capture photos */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
            2. Upload Receipt Photos (Up to 3 images)
          </label>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />

          {images.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-10 px-4 text-center hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer transition-all dark:border-slate-700 dark:bg-slate-800/20"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-300 mb-3">
                <Camera className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Snap photo or choose receipt files
              </p>
              <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, WEBP (Supports long receipts)</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 group">
                    <img src={img} alt={`Receipt ${idx + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors"
                      title="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Photo {idx + 1}
                    </span>
                  </div>
                ))}

                {images.length < 3 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-emerald-500 hover:bg-emerald-50/20 transition-colors dark:border-slate-700 dark:bg-slate-800/40"
                  >
                    <Upload className="h-5 w-5 mb-1" />
                    <span className="text-xs font-semibold">+ Add photo</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleParseImages}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting items with Gemini 3.7 Flash...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Scan & Extract Receipt</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Instant Demo / Sample Receipts */}
        <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Or Try a Sample Receipt Instantly
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {SAMPLE_RECEIPTS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleUseSample(sample)}
                disabled={isProcessing}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {sample.label}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Load →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
