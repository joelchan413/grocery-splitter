// Art direction: anthropics/skills, skills/frontend-design only.
import { Upload, ReceiptText } from 'lucide-react';
import { SAMPLE_RECEIPTS } from '@/lib/receipts';
import type { ScannerParts } from './scanner-parts';

export function AnthropicScanner({ payer, upload, samples, error, onChoosePhotos }: ScannerParts) {
  const sample = SAMPLE_RECEIPTS[0].data;
  const total = sample.items.reduce((sum, item) => sum + item.totalPrice - (item.lineDiscount || 0), 0) + sample.taxTotal - sample.basketDiscount;

  return (
    <div className="anthropic-scanner">
      <div className="market-intro">
        <div className="market-copy">
          <h1>Good groceries.<br />Fair shares.</h1>
          <p>You bought the groceries. Everyone picks their items.<br className="market-desktop-break" /> We’ll sort out who owes what.</p>
          <button type="button" onClick={onChoosePhotos} className="market-start">Add a receipt <Upload size={18} aria-hidden="true" /></button>
        </div>
        <aside className="market-receipt-scene" aria-label="Example grocery receipt">
          <div className="market-receipt">
            <ReceiptText size={24} aria-hidden="true" />
            <h2>{sample.storeName}</h2>
            <p>Example grocery run</p>
            <dl>
              {sample.items.slice(0, 3).map(item => <div key={item.id}><dt>{item.name.replace(/ \(.+\)/, '')}</dt><dd>${item.totalPrice.toFixed(2)}</dd></div>)}
              <div><dt>Other items &amp; tax</dt><dd>${(total - sample.items.slice(0, 3).reduce((sum, item) => sum + item.totalPrice, 0)).toFixed(2)}</dd></div>
              <div className="market-receipt-total"><dt>Total</dt><dd>${total.toFixed(2)}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
      <div id="receipt-workspace" className="market-workspace">
        <section className="market-payer">{payer}</section>
        <section className="market-upload">{upload}{error}</section>
      </div>
      <section className="market-samples">{samples}</section>
      <p className="scanner-footer">Personal items stay personal. Unclaimed items are shared by the household.</p>
    </div>
  );
}
