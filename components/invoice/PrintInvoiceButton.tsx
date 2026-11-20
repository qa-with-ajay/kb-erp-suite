"use client";

import type { InvoicePrintFormat } from "./invoiceTypes";

export type { InvoicePrintFormat };

interface Props {
  format: InvoicePrintFormat;
  onFormatChange: (format: InvoicePrintFormat) => void;
  onPrint: () => void;
  children?: React.ReactNode; // e.g. <InvoicePDF />
}

export function PrintInvoiceButton({ format, onFormatChange, onPrint, children }: Props) {
  return (
    <div className="invoice-print-controls flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">Format</span>
        <select
          value={format}
          onChange={(e) => onFormatChange(e.target.value as InvoicePrintFormat)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2"
          aria-label="Invoice print format"
        >
          <option value="a4">A4 GST Invoice</option>
          <option value="thermal-80">Thermal 80mm</option>
          <option value="thermal-58">Thermal 58mm</option>
        </select>
      </label>
      <button type="button" onClick={onPrint} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
        Print invoice
      </button>
      {children}
    </div>
  );
}
