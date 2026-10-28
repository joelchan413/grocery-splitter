import { useMemo } from 'react';
import { create } from 'qrcode';

/**
 * The trip link as a QR code, drawn locally as SVG so the private link is never sent to a third party.
 * A quiet zone of 2 modules surrounds the code, as scanners expect.
 */
export function TripQrCode({ value, size = 192 }: { value: string; size?: number }) {
  const { path, dimension } = useMemo(() => {
    if (!value) return { path: '', dimension: 1 };
    const { modules } = create(value, { errorCorrectionLevel: 'M' });
    const quiet = 2;
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    return { path: d, dimension: modules.size + quiet * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label="QR code that opens this trip"
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className="block"
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#1b1d1f" />
    </svg>
  );
}
