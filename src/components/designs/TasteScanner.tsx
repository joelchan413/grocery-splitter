// Art direction: Leonxlnx/taste-skill v2, quiet-instrument, seed 1566957308 only.
import type { ScannerParts } from './scanner-parts';

export function TasteScanner({ payer, upload, samples, error }: ScannerParts) {
  return (
    <div className="taste-scanner">
      <div className="taste-intro">
        <h1>Split the grocery run.</h1>
        <p>Your items, shared groceries, the right share of tax.</p>
      </div>
      <div className="taste-instrument" data-ui>
        <section className="taste-payer">{payer}</section>
        <section className="taste-upload">{upload}{error}</section>
      </div>
      <section className="taste-samples">{samples}</section>
      <p className="scanner-footer">Unclaimed items are split equally. Your personal items and their tax stay with you.</p>
    </div>
  );
}
