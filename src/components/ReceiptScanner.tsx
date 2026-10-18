'use client';

/* eslint-disable @next/next/no-img-element -- Local receipt previews use data URLs with unknown dimensions. */
import { useState, useRef, type ChangeEvent } from 'react';
import { Camera, Upload, X, AlertCircle, Loader2, Check, ArrowRight } from 'lucide-react';
import type { Household, Trip } from '@/types';
import { SAMPLE_RECEIPTS, type ParsedReceiptData } from '@/lib/receipts';
import { readReceiptResponse } from '@/lib/receipt-response';
import { AnthropicScanner } from './designs/AnthropicScanner';
import { TasteScanner } from './designs/TasteScanner';
import type { DesignVariant } from './designs/DesignSwitcher';

interface ReceiptScannerProps {
  household: Household;
  onTripScanned: (newTrip: Trip) => void;
  design: DesignVariant;
}

export function ReceiptScanner({ household, onTripScanned, design }: ReceiptScannerProps) {
  const [selectedPayerId, setSelectedPayerId] = useState(household.participants[0]?.id || 'p1');
  const [images, setImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 3 - images.length);
    event.target.value = '';
    if (!files.length) return;
    setErrorMessage(null);
    try {
      const photos = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read this photo. Please choose it again.'));
        reader.readAsDataURL(file);
      })));
      setImages(previous => [...previous, ...photos].slice(0, 3));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not read these photos. Please try again.');
    }
  };

  const constructAndEmitTrip = (parsed: ParsedReceiptData, receiptImages = images) => {
    const now = Date.now();
    onTripScanned({
      id: `trip-${now}`,
      householdId: household.id,
      storeName: parsed.storeName || 'Grocery Store',
      date: parsed.date || new Date().toISOString().split('T')[0],
      payerId: selectedPayerId,
      items: parsed.items.map((item, index) => ({ ...item, id: item.id || `item-${now}-${index}` })),
      taxTotal: parsed.taxTotal || 0,
      basketDiscount: parsed.basketDiscount || 0,
      receiptImages,
      claims: {},
      readyParticipantIds: [],
      status: 'review',
      createdAt: new Date().toISOString(),
    });
  };

  const handleParseImages = async () => {
    if (!images.length) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/scan-receipt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }),
      });
      constructAndEmitTrip(await readReceiptResponse(response));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not scan this receipt. Try another photo or a sample receipt.');
    } finally {
      setIsProcessing(false);
    }
  };

  const payer = <>
    <h2 className="scan-section-title">Who paid?</h2>
    <p className="scan-section-note">Choose who covered this grocery run.</p>
    <div className="scan-people" role="group" aria-label="Receipt payer">
      {household.participants.map(person => <button
        key={person.id} type="button" disabled={isProcessing}
        className="scan-person" aria-pressed={selectedPayerId === person.id}
        onClick={() => setSelectedPayerId(person.id)}
      >
        <span className="scan-avatar" aria-hidden="true">{design === 'taste' ? person.name.slice(0, 1) : person.avatarEmoji}</span>
        <span className="scan-person-name">{person.name}<small>{selectedPayerId === person.id ? 'Paid the bill' : person.venmoHandle || 'Roommate'}</small></span>
        {selectedPayerId === person.id && <Check className="scan-person-check" size={16} aria-hidden="true" />}
      </button>)}
    </div>
  </>;

  const upload = <>
    <h2 className="scan-section-title">Add your receipt</h2>
    <p className="scan-section-note">Up to 3 photos. JPG, PNG or WebP, 8 MB each.</p>
    <input type="file" aria-label="Receipt photos" ref={fileInputRef} onChange={handleFileChange} accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={isProcessing} tabIndex={-1} />
    {images.length === 0 ? <button type="button" className="scan-dropzone" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
      <span className="scan-camera"><Camera size={28} strokeWidth={1.5} aria-hidden="true" /></span>
      <span className="scan-drop-title">Take a photo or choose files</span>
      <span className="scan-drop-note">Include the items, tax and total.</span>
      <span className="scan-choose">Choose receipt photos <Upload size={16} aria-hidden="true" /></span>
    </button> : <div className="scan-photo-list">
      {images.map((src, index) => <div key={index} className="scan-photo">
        <img src={src} alt={`Receipt photo ${index + 1}`} />
        <button type="button" aria-label={`Remove photo ${index + 1}`} disabled={isProcessing} onClick={() => setImages(previous => previous.filter((_, i) => i !== index))}><X size={16} /></button>
      </div>)}
      {images.length < 3 && <button type="button" disabled={isProcessing} className="scan-add-photo" onClick={() => fileInputRef.current?.click()}><Upload size={20} aria-hidden="true" /> Add photo</button>}
    </div>}
    {images.length > 0 && <button type="button" className="scan-submit" onClick={handleParseImages} disabled={isProcessing}>
      {isProcessing ? <><Loader2 className="animate-spin" size={18} aria-hidden="true" /> Reading your receipt…</> : <>Scan receipt <ArrowRight size={18} aria-hidden="true" /></>}
    </button>}
    <p className="scan-processing-note" role="status" aria-live="polite">{isProcessing ? 'Reading items and prices. This can take up to two minutes.' : 'You can check every item before sharing with roommates.'}</p>
  </>;

  const samples = <>
    <div className="scan-samples-heading"><h2 className="scan-section-title">Try a sample receipt</h2><p className="scan-section-note">See how a split works before uploading.</p></div>
    <div className="scan-sample-list">
      {SAMPLE_RECEIPTS.map(sample => <button type="button" key={sample.id} disabled={isProcessing} className="scan-sample" onClick={() => constructAndEmitTrip(sample.data, [])}>
        <span>{sample.data.storeName}<small>{sample.data.items.length} items</small></span>
        <span className="scan-sample-action">Open sample <ArrowRight size={16} aria-hidden="true" /></span>
      </button>)}
    </div>
  </>;
  const error = errorMessage && <div role="alert" className="scan-error"><AlertCircle size={18} aria-hidden="true" /><span>{errorMessage}</span></div>;
  const Presentation = design === 'anthropic' ? AnthropicScanner : TasteScanner;
  return <Presentation payer={payer} upload={upload} samples={samples} error={error} onChoosePhotos={() => fileInputRef.current?.click()} />;
}
