'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ArrowRight, ChevronDown, Check } from 'lucide-react';
import { Trip, LineItem, Household } from '@/types';
import { round2 } from '@/lib/calculations';
import { ActionBar, TripSteps } from './TripLayout';

interface ReceiptReviewProps {
  trip: Trip;
  household: Household;
  onUpdateTrip: (updated: Trip) => void;
  onConfirmAndProceed: (updatedTrip: Trip, next?: 'claiming' | 'settlement') => void;
  /** Saved receipt photos, shown under the title. */
  photos?: React.ReactNode;
  /** Filled with a function that saves unsaved edits now, for when the open trip is about to change. */
  flushRef?: React.MutableRefObject<(() => void) | null>;
}

type ReviewFields = Pick<Trip, 'storeName' | 'date' | 'payerId' | 'items' | 'taxTotal' | 'basketDiscount'>;
const snapshot = (fields: ReviewFields) =>
  JSON.stringify([fields.storeName, fields.date, fields.payerId, fields.items, fields.taxTotal, fields.basketDiscount]);

export function ReceiptReview({
  trip,
  household,
  onUpdateTrip,
  onConfirmAndProceed,
  photos,
  flushRef,
}: ReceiptReviewProps) {
  const [storeName, setStoreName] = useState(trip.storeName);
  const [date, setDate] = useState(trip.date);
  const [items, setItems] = useState<LineItem[]>(trip.items);
  const [taxTotal, setTaxTotal] = useState<number>(trip.taxTotal);
  const [basketDiscount, setBasketDiscount] = useState<number>(trip.basketDiscount);

  const [selectedPayerId, setPayerId] = useState<string>(trip.payerId);
  const payerId = household.participants.some((p) => p.id === selectedPayerId)
    ? selectedPayerId
    : household.participants[0]?.id ?? selectedPayerId;

  // Leaving this screen any other way than the forward button (Back, a step, History) still keeps the edits.
  // The latest trip is read at that moment, so claims that arrived meanwhile aren't overwritten.
  const [initial] = useState(() => snapshot(trip));
  const proceeded = useRef(false);
  const latest = useRef({ trip, fields: { storeName, date, payerId, items, taxTotal, basketDiscount } as ReviewFields, onUpdateTrip });
  useEffect(() => {
    latest.current = { trip, fields: { storeName, date, payerId, items, taxTotal, basketDiscount }, onUpdateTrip };
  });
  useEffect(() => {
    const flush = () => {
      const { trip: current, fields, onUpdateTrip: save } = latest.current;
      if (proceeded.current || fields.items.length === 0 || snapshot(fields) === initial) return;
      proceeded.current = true;
      save({ ...current, ...fields, storeName: fields.storeName.trim() || 'Grocery Store' });
    };
    if (flushRef) flushRef.current = flush;
    return () => {
      flush();
      if (flushRef?.current === flush) flushRef.current = null;
    };
  }, [initial, flushRef]);


  const handleUpdateItem = (id: string, updates: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, ...updates };
          updated.totalPrice = round2(updated.quantity * updated.unitPrice);
          return updated;
        }
        return item;
      })
    );
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      name: 'New item',
      quantity: 1,
      unitPrice: 3.99,
      totalPrice: 3.99,
      isTaxable: false,
      lineDiscount: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const itemsGross = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  const lineDiscountsTotal = items.reduce((acc, it) => acc + (it.lineDiscount || 0), 0);
  const itemsNet = Math.max(0, itemsGross - lineDiscountsTotal);
  // A discount larger than the receipt makes the bill $0.00, as on the balances screen.
  const calculatedGrandTotal = Math.max(0, round2(itemsNet + taxTotal - basketDiscount));

  const handleSaveAndContinue = (next: 'claiming' | 'settlement' = 'claiming') => {
    if (items.length === 0) return;
    proceeded.current = true;

    const updatedTrip: Trip = {
      ...trip,
      storeName: storeName.trim() || 'Grocery Store',
      date,
      payerId,
      items,
      taxTotal,
      basketDiscount,
      // Fixing an item on an archived run keeps it archived.
      status: trip.status === 'settled' ? 'settled' : 'claiming',
    };

    onConfirmAndProceed(updatedTrip, next);
  };

  // A run already open for claims saves these edits on the way back to claiming.
  const reopening = trip.status !== 'review';
  // Fields are 16px on phones, the size below which iOS zooms in on focus.
  const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-slate-900 focus:border-slate-900 focus:outline-none sm:text-[15px]';

  return (
    <div className="screen has-bar">
      <TripSteps
        current="review"
        onOpen={reopening && items.length > 0 ? { claiming: () => handleSaveAndContinue('claiming'), settlement: () => handleSaveAndContinue('settlement') } : {}}
      />
      <div className="mb-6">
        <h1 className="screen-title">Check receipt items</h1>
        <p className="screen-lede">Fix names and prices, and mark which items were taxed, before roommates claim.</p>
      </div>
      {photos}

      {/* Store Metadata Card */}
      <div className="card mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <label htmlFor="review-store" className="mb-1.5 block text-sm text-slate-500">
            Store
          </label>
          <input
            id="review-store"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="review-date" className="mb-1.5 block text-sm text-slate-500">
            Date
          </label>
          <input
            id="review-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="review-payer" className="mb-1.5 block text-sm text-slate-500">
            Paid by
          </label>
          <div className="relative">
            <select
              id="review-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className={`${fieldClass} appearance-none pr-9 cursor-pointer`}
            >
              {household.participants.map((p) => (
                <option key={p.id} value={p.id} className="bg-white text-slate-900 py-1">
                  {p.name}{p.venmoHandle ? ` (${p.venmoHandle})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Line Items List */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] px-4 py-3 sm:px-5">
          <h2 className="text-base font-medium text-slate-900">
            Items <span className="font-normal text-slate-500 num">({items.length})</span>
          </h2>
          <button type="button" onClick={handleAddItem} className="btn btn-secondary btn-sm">
            <Plus aria-hidden="true" />
            <span>Add item</span>
          </button>
        </div>

        {items.length === 0 && (
          <p className="px-5 py-8 text-center text-[15px] text-slate-500">No items yet. Add each item from the receipt to open claims.</p>
        )}

        <div className="divide-y divide-[var(--rule)]">
          {items.map((item, index) => {
            const itemLabel = item.name.trim() || `item ${index + 1}`;
            return (
            <div
              key={item.id}
              className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
            >
              <div className="flex flex-1 items-center gap-3">
                <input
                  type="text"
                  aria-label={`Name of item ${index + 1}`}
                  value={item.name}
                  onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-base font-medium sm:text-[15px] text-slate-900 focus:border-slate-900 focus:outline-none"
                  placeholder="Item name"
                />
                {/* On phones the line total sits beside the name, so one row holds every control below. */}
                <span className="w-16 text-right text-[15px] font-semibold text-slate-900 num sm:hidden">
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-x-2.5 sm:gap-x-3">
                {/* Quantity */}
                <label className="flex items-center gap-1">
                  <span className="sr-only whitespace-nowrap text-[13px] text-slate-500 sm:not-sr-only">Qty</span>
                  <span className="sr-only"> of {itemLabel}</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-11 rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-center text-base font-medium sm:text-sm text-slate-900 num focus:border-slate-900 focus:outline-none"
                  />
                </label>

                <span className="text-sm text-slate-500 sm:hidden" aria-hidden="true">× $</span>

                {/* Unit Price */}
                <label className="flex items-center gap-1">
                  <span className="sr-only whitespace-nowrap text-[13px] text-slate-500 sm:not-sr-only">Each $</span>
                  <span className="sr-only"> for {itemLabel}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-[4.25rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-base font-medium sm:text-sm text-slate-900 num focus:border-slate-900 focus:outline-none"
                  />
                </label>

                {/* Line Total */}
                <span className="hidden w-16 text-right text-[15px] font-semibold text-slate-900 num sm:inline">
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </span>

                {/* Taxable Toggle */}
                <button
                  type="button"
                  onClick={() => handleUpdateItem(item.id, { isTaxable: !item.isTaxable })}
                  aria-pressed={item.isTaxable}
                  // One fixed name with a pressed state: "Taxed: Milk, pressed" rather than a label that flips.
                  aria-label={`Taxed: ${itemLabel}`}
                  className={`tax-toggle${item.isTaxable ? ' is-on' : ''}`}
                  title={item.isTaxable ? 'Taxed on the receipt. Select to mark as not taxed.' : 'Not taxed. Select to mark as taxed.'}
                >
                  {item.isTaxable && <Check aria-hidden="true" />}
                  Taxed
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  className="btn btn-quiet btn-icon btn-sm ml-auto hover:text-red-700! sm:ml-0"
                  title="Remove item"
                  aria-label={`Remove ${itemLabel}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Tax, Discounts & Totals Summary Card */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-medium text-slate-900">
            Tax and discounts
          </h2>

          <div className="flex items-center justify-between">
            <label htmlFor="review-tax" className="text-[15px] text-slate-700">
              Sales tax ($)
            </label>
            <input
              id="review-tax"
              type="number"
              step="0.01"
              min="0"
              value={taxTotal}
              onChange={(e) => setTaxTotal(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-base font-medium sm:text-sm text-slate-900 num focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="review-discount" className="text-[15px] text-slate-700">
              Basket discount ($)
            </label>
            <input
              id="review-discount"
              type="number"
              step="0.01"
              min="0"
              value={basketDiscount}
              onChange={(e) => setBasketDiscount(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-base font-medium sm:text-sm text-slate-900 num focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="card flex flex-col justify-between p-4 sm:p-5">
          <div className="space-y-1">
            <div className="flex justify-between text-[15px] text-slate-600">
              <span>Items</span>
              <span className="font-medium text-slate-900 num">${itemsNet.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[15px] text-slate-600">
              <span>Tax</span>
              <span className="font-medium text-slate-900 num">+${taxTotal.toFixed(2)}</span>
            </div>
            {basketDiscount > 0 && (
              <div className="flex justify-between text-[15px] text-slate-600">
                <span>Basket discount</span>
                <span className="font-medium text-positive num">-${basketDiscount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-2 mt-2 flex items-baseline justify-between">
            <span className="text-[15px] font-semibold text-slate-900">
              Total
            </span>
            <span className="text-2xl font-semibold text-slate-900 num">
              ${calculatedGrandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <ActionBar>
        <div className="min-w-0">
          <p className="action-bar-label">{items.length === 0 ? 'Add an item first' : 'Total'}</p>
          <p className="action-bar-value num">${calculatedGrandTotal.toFixed(2)}</p>
        </div>
        <button type="button" onClick={() => handleSaveAndContinue()} disabled={items.length === 0} className="btn btn-primary btn-lg">
          <span>{reopening ? 'Save and claim' : 'Open for roommate claims'}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </ActionBar>
    </div>
  );
}
