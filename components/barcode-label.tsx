"use client";

import { BarcodeFormat, Code128Writer } from "@zxing/library";
import { useMemo } from "react";

type Props = { value: string; title?: string };

type BarcodeResult =
  | { bars: Array<{ x: number; width: number }>; error: null }
  | { bars: []; error: string };

export function BarcodeLabel({ value, title }: Props) {
  const result = useMemo<BarcodeResult>(() => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return { bars: [], error: "Barcode value is empty." };
    if (normalizedValue.length > 80) return { bars: [], error: "Code 128 supports up to 80 characters." };
    if (!/^[\x20-\x7E]+$/.test(normalizedValue)) {
      return { bars: [], error: "Code 128 requires printable ASCII characters. Check the barcode value." };
    }

    try {
      const matrix = new Code128Writer().encode(normalizedValue, BarcodeFormat.CODE_128, 520, 110);
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
      if (output.length === 0) return { bars: [], error: "The barcode encoder returned an empty image." };
      return { bars: output, error: null };
    } catch (cause) {
      console.error("Code 128 barcode rendering failed:", cause);
      return { bars: [], error: "Barcode could not be encoded. Check the value and try again." };
    }
  }, [value]);

  const normalizedValue = value.trim();

  return (
    <div className="barcode-print-area inline-flex min-w-64 flex-col items-center rounded-lg border border-gray-200 bg-white p-3">
      {title && <p className="mb-1 max-w-full truncate text-xs font-semibold">{title}</p>}
      {result.bars.length ? (
        <svg role="img" aria-label={`Code 128 barcode ${normalizedValue}`} viewBox="0 0 520 110" className="h-20 w-full max-w-[520px]" preserveAspectRatio="none">
          {result.bars.map((bar, index) => <rect key={index} x={bar.x} y="0" width={bar.width} height="110" fill="black" />)}
        </svg>
      ) : <p role="status" className="text-xs text-red-700">{result.error ?? "Unable to render barcode."}</p>}
      <p className="mt-1 break-all font-mono text-xs tracking-wider">{normalizedValue || value}</p>
      <button type="button" onClick={() => window.print()} disabled={!result.bars.length} className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 print:hidden">Print label</button>
      <style jsx global>{`@media print { body * { visibility: hidden !important; } .barcode-print-area, .barcode-print-area * { visibility: visible !important; } .barcode-print-area { position: absolute !important; left: 0 !important; top: 0 !important; border: 0 !important; box-shadow: none !important; } }`}</style>
    </div>
  );
}
