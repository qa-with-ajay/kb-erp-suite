"use client";

import { BarcodeFormat, MultiFormatWriter } from "@zxing/library";
import { useMemo } from "react";

type Props = { value: string; title?: string };

export function BarcodeLabel({ value, title }: Props) {
  const bars = useMemo(() => {
    try {
      const matrix = new MultiFormatWriter().encode(value, BarcodeFormat.CODE_128, 520, 110);
      const output: Array<{ x: number; width: number }> = [];
      let start = -1;
      for (let x = 0; x < matrix.getWidth(); x += 1) {
        let dark = false;
        for (let y = 0; y < matrix.getHeight(); y += 1) {
          if (matrix.get(x, y)) { dark = true; break; }
        }
        if (dark && start < 0) start = x;
        if ((!dark || x === matrix.getWidth() - 1) && start >= 0) {
          const end = dark && x === matrix.getWidth() - 1 ? x + 1 : x;
          output.push({ x: start, width: end - start });
          start = -1;
        }
      }
      return output;
    } catch {
      return [];
    }
  }, [value]);

  return (
    <div className="barcode-print-area inline-flex min-w-64 flex-col items-center rounded-lg border border-gray-200 bg-white p-3">
      {title && <p className="mb-1 max-w-full truncate text-xs font-semibold">{title}</p>}
      {bars.length ? (
        <svg role="img" aria-label={`Code 128 barcode ${value}`} viewBox="0 0 520 110" className="h-20 w-full max-w-[520px]" preserveAspectRatio="none">
          {bars.map((bar, index) => <rect key={index} x={bar.x} y="0" width={bar.width} height="110" fill="black" />)}
        </svg>
      ) : <p className="text-xs text-red-700">Unable to render barcode.</p>}
      <p className="mt-1 break-all font-mono text-xs tracking-wider">{value}</p>
      <button type="button" onClick={() => window.print()} className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 print:hidden">Print label</button>
      <style jsx global>{`@media print { body * { visibility: hidden !important; } .barcode-print-area, .barcode-print-area * { visibility: visible !important; } .barcode-print-area { position: absolute !important; left: 0 !important; top: 0 !important; border: 0 !important; box-shadow: none !important; } }`}</style>
    </div>
  );
}
