'use client';

import React, { useState } from 'react';
import { Plus, Trash2, ArrowRight, ArrowLeft, ChevronDown } from 'lucide-react';
import { Trip, LineItem, Household } from '@/types';
import { round2 } from '@/lib/calculations';

interface ReceiptReviewProps {
  trip: Trip;
  household: Household;
  onUpdateTrip: (updated: Trip) => void;
  onConfirmAndProceed: (updatedTrip: Trip) => void;
  onBackToScanner: () => void;
}

export function ReceiptReview({
  trip,
  household,
  onConfirmAndProceed,
  onBackToScanner,
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
  const calculatedGrandTotal = round2(itemsNet + taxTotal - basketDiscount);

  const handleSaveAndContinue = () => {
    if (items.length === 0) {
      alert('Add at least one item before opening claims.');
      return;
    }

    const updatedTrip: Trip = {
      ...trip,
      storeName: storeName.trim() || 'Grocery Store',
      date,
      payerId,
      items,
      taxTotal,
      basketDiscount,
      status: 'claiming',
    };

    onConfirmAndProceed(updatedTrip);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            type="button"
            onClick={onBackToScanner}
            className="flex items-center gap-1 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to new run
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">Check receipt items</h1>
          <p className="text-sm text-slate-500">
            Fix names and prices, and mark which items were taxed, before roommates claim.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveAndContinue}
            className="flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-500 transition-colors cursor-pointer"
          >
            <span>Open for roommate claims</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Store Metadata Card */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="review-store" className="block text-sm font-medium text-slate-700 mb-1">
            Store
          </label>
          <input
            id="review-store"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="review-date" className="block text-sm font-medium text-slate-700 mb-1">
            Date
          </label>
          <input
            id="review-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="review-payer" className="block text-sm font-medium text-slate-700 mb-1">
            Paid by
          </label>
          <div className="relative">
            <select
              id="review-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 pr-9 text-sm font-semibold text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none cursor-pointer"
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
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Items <span className="font-normal text-slate-500 num">({items.length})</span>
          </h2>
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add item</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  aria-label="Item name"
                  value={item.name}
                  onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-primary-500 focus:outline-none"
                  placeholder="Item name"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-between sm:flex-nowrap sm:justify-end">
                {/* Quantity */}
                <label className="flex items-center gap-1">
                  <span className="whitespace-nowrap text-xs text-slate-500">Qty</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-12 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-sm font-medium text-slate-900 num focus:border-primary-500"
                  />
                </label>

                {/* Unit Price */}
                <label className="flex items-center gap-1">
                  <span className="whitespace-nowrap text-xs text-slate-500">Each $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm font-medium text-slate-900 num focus:border-primary-500"
                  />
                </label>

                {/* Line Total */}
                <span className="text-sm font-semibold text-slate-900 w-16 text-right num">
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </span>

                {/* Taxable Toggle */}
                <button
                  type="button"
                  onClick={() => handleUpdateItem(item.id, { isTaxable: !item.isTaxable })}
                  aria-pressed={item.isTaxable}
                  className={`min-w-20 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    item.isTaxable
                      ? 'bg-amber-50 text-amber-900 border border-amber-300'
                      : 'bg-white text-slate-600 border border-slate-300'
                  }`}
                  title={item.isTaxable ? 'Taxed on the receipt. Select to mark as not taxed.' : 'Not taxed. Select to mark as taxed.'}
                >
                  {item.isTaxable ? 'Taxed' : 'Not taxed'}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  className="rounded-md p-1 text-slate-500 hover:text-red-700"
                  title="Remove item"
                  aria-label={`Remove ${item.name || 'item'}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax, Discounts & Totals Summary Card */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Tax and discounts
          </h2>

          <div className="flex items-center justify-between">
            <label htmlFor="review-tax" className="text-sm text-slate-700">
              Sales tax ($)
            </label>
            <input
              id="review-tax"
              type="number"
              step="0.01"
              min="0"
              value={taxTotal}
              onChange={(e) => setTaxTotal(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-right text-sm font-medium text-slate-900 num focus:border-primary-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="review-discount" className="text-sm text-slate-700">
              Basket discount ($)
            </label>
            <input
              id="review-discount"
              type="number"
              step="0.01"
              min="0"
              value={basketDiscount}
              onChange={(e) => setBasketDiscount(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-right text-sm font-medium text-slate-900 num focus:border-primary-500"
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Items</span>
              <span className="font-medium text-slate-900 num">${itemsNet.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tax</span>
              <span className="font-medium text-slate-900 num">+${taxTotal.toFixed(2)}</span>
            </div>
            {basketDiscount > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Basket discount</span>
                <span className="font-medium text-positive num">-${basketDiscount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-2 mt-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-900">
              Total
            </span>
            <span className="text-2xl font-semibold text-slate-900 num">
              ${calculatedGrandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
