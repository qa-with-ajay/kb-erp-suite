"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = { value: string; title?: string };

type JsBarcodeRenderer = (
  element: SVGSVGElement,
  value: string,
  options: {
    format: "CODE128";
    width: number;
    height: number;
    displayValue: boolean;
    margin: number;
    lineColor: string;
    background: string;
  }
) => void;

export function BarcodeLabel({ value, title }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedValue = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    const svg = svgRef.current;
    let cancelled = false;

    if (!svg) return;

    svg.replaceChildren();

    const render = async () => {
      if (!normalizedValue) {
        setError("Barcode value is empty.");
        return;
      }
      if (normalizedValue.length > 80) {
        setError("Code 128 supports up to 80 characters.");
        return;
      }
      if (!/^[\\x20-\\x7E]+$/.test(normalizedValue)) {
        setError("Code 128 requires printable ASCII characters. Check the barcode value.");
        return;
      }

      try {
        // Load the CommonJS package at runtime to avoid an undefined static
        // default import in the Next.js/Webpack client bundle.
        const barcodeModule = await import("jsbarcode");
        const renderBarcode = (
          barcodeModule.default ??
          (barcodeModule as unknown as { default?: JsBarcodeRenderer } & JsBarcodeRenderer)
        ) as JsBarcodeRenderer;

        if (cancelled) return;

        if (typeof renderBarcode !== "function") {
          throw new Error("The jsbarcode module did not expose a renderer function.");
        }

        renderBarcode(svg, normalizedValue, {
          format: "CODE128",
          width: 2,
          height: 80,
          displayValue: false,
          margin: 10,
          lineColor: "#000000",
          background: "#ffffff",
        });
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        console.error("Code 128 barcode rendering failed:", cause);
        setError(
          cause instanceof Error
            ? `Barcode renderer error: ${cause.message}`
            : "Barcode renderer failed unexpectedly."
        );
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [normalizedValue]);

  return (
    <div className="barcode-print-area inline-flex min-w-64 flex-col items-center rounded-lg border border-gray-200 bg-white p-3">
      {title && <p className="mb-1 max-w-full truncate text-xs font-semibold">{title}</p>}
      {error ? (
        <p role="status" className="text-xs text-red-700">{error}</p>
      ) : (
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Code 128 barcode ${normalizedValue}`}
          className="h-20 w-full max-w-[520px]"
        />
      )}
      <p className="mt-1 break-all font-mono text-xs tracking-wider">{normalizedValue || value}</p>
      <button
        type="button"
        onClick={() => window.print()}
        disabled={Boolean(error) || !normalizedValue}
        className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
      >
        Print label
      </button>
      <style jsx global>{`@media print { body * { visibility: hidden !important; } .barcode-print-area, .barcode-print-area * { visibility: visible !important; } .barcode-print-area { position: absolute !important; left: 0 !important; top: 0 !important; border: 0 !important; box-shadow: none !important; } }`}</style>
    </div>
  );
}
