'use client';

import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, DollarSign, Tag, ArrowRight, ArrowLeft } from 'lucide-react';
import { Trip, LineItem, Household } from '@/types';
import { round2 } from '@/lib/calculations';

interface ReceiptReviewProps {
  trip: Trip;
  household: Household;
  onUpdateTrip: (updated: Trip) => void;
  onConfirmAndProceed: () => void;
  onBackToScanner: () => void;
}

export function ReceiptReview({
  trip,
  household,
  onUpdateTrip,
  onConfirmAndProceed,
  onBackToScanner,
}: ReceiptReviewProps) {
  const [storeName, setStoreName] = useState(trip.storeName);
  const [date, setDate] = useState(trip.date);
  const [items, setItems] = useState<LineItem[]>(trip.items);
  const [taxTotal, setTaxTotal] = useState<number>(trip.taxTotal);
  const [basketDiscount, setBasketDiscount] = useState<number>(trip.basketDiscount);

  const [payerId, setPayerId] = useState<string>(trip.payerId);

  const selectedPayer = household.participants.find((p) => p.id === payerId) || household.participants[0];

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
      name: 'New Grocery Item',
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
      alert('Please add at least one line item.');
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

    onUpdateTrip(updatedTrip);
    onConfirmAndProceed();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={onBackToScanner}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Scanner
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Verify Receipt Items</h1>
          <p className="text-xs text-slate-500">
            Review parsed line items, set taxability flags, and adjust prices before roommates claim.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAndContinue}
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <span>Open for Roommate Claims</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Store Metadata Card */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Store Name
          </label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Purchase Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Payer (Who Paid)
          </label>
          <div className="relative">
            <select
              aria-label="Payer selection"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
            >
              {household.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatarEmoji} {p.name} {p.venmoHandle ? `(${p.venmoHandle})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Line Items List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Line Items ({items.length})
          </span>
          <button
            onClick={handleAddItem}
            className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-emerald-600 shadow-sm border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Item name"
                />
              </div>

              <div className="flex items-center gap-2 sm:gap-3 justify-between sm:justify-end pl-7 sm:pl-0">
                {/* Quantity */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Qty:</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-12 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs font-bold text-slate-900 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Unit Price */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">$ ea:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-bold text-slate-900 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Line Total */}
                <span className="text-xs font-bold text-slate-900 dark:text-white w-14 text-right">
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </span>

                {/* Taxable Toggle */}
                <button
                  type="button"
                  onClick={() => handleUpdateItem(item.id, { isTaxable: !item.isTaxable })}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                    item.isTaxable
                      ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}
                  title={item.isTaxable ? 'Taxable item' : 'Tax-exempt staple'}
                >
                  {item.isTaxable ? '🏷️ Taxed' : '🌱 Exempt'}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  className="text-slate-400 hover:text-red-500 p-1"
                  title="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax, Discounts & Totals Summary Card */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Taxes & Store Discounts
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Receipt Sales Tax ($):
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={taxTotal}
              onChange={(e) => setTaxTotal(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-xs font-bold text-slate-900 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Store / Basket Coupon ($):
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={basketDiscount}
              onChange={(e) => setBasketDiscount(parseFloat(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-xs font-bold text-slate-900 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Items Subtotal:</span>
              <span className="font-semibold">${itemsNet.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Sales Tax:</span>
              <span className="font-semibold">+${taxTotal.toFixed(2)}</span>
            </div>
            {basketDiscount > 0 && (
              <div className="flex justify-between text-xs text-emerald-600 font-semibold">
                <span>Basket Discount:</span>
                <span>-${basketDiscount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-emerald-200/60 pt-2 mt-2 flex items-baseline justify-between dark:border-emerald-900">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
              Grand Total:
            </span>
            <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">
              ${calculatedGrandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
