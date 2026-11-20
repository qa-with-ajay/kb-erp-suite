"use client";

import "./InvoicePrintStyles.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { A4Invoice } from "./A4Invoice";
import { InvoicePDF } from "./InvoicePDF";
import { PrintInvoiceButton } from "./PrintInvoiceButton";
import { ThermalInvoice } from "./ThermalInvoice";
import type { InvoiceData, InvoicePrintFormat } from "./invoiceTypes";

export type { InvoiceData, InvoiceItem } from "./invoiceTypes";

const STORAGE_KEY = "kb-erp:invoice-format";
const FORMATS: InvoicePrintFormat[] = ["a4", "thermal-80", "thermal-58"];

function Layout({ invoice, format }: { invoice: InvoiceData; format: InvoicePrintFormat }) {
  return format === "a4" ? (
    <A4Invoice invoice={invoice} />
  ) : (
    <ThermalInvoice invoice={invoice} width={format === "thermal-80" ? "80mm" : "58mm"} />
  );
}

export function InvoiceDocument({ invoice, defaultFormat = "a4" }: { invoice: InvoiceData; defaultFormat?: InvoicePrintFormat }) {
  const [format, setFormat] = useState<InvoicePrintFormat>(defaultFormat);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as InvoicePrintFormat | null;
      if (saved && FORMATS.includes(saved)) setFormat(saved);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  const changeFormat = (next: InvoicePrintFormat) => {
    setFormat(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="invoice-document">
      <div className="mb-4">
        <PrintInvoiceButton format={format} onFormatChange={changeFormat} onPrint={() => window.print()}>
          <InvoicePDF fileName={invoice.invoiceNumber} />
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </PrintInvoiceButton>
      </div>

      {/* Screen preview */}
      <div className={`invoice-print-area invoice-format-${format}`}>
        <Layout invoice={invoice} format={format} />
      </div>

      {/* Print copy: portalled to <body> so print CSS can hide every other body child
          (sidebar, header, panels) and the invoice still paginates normally. */}
      {mounted &&
        createPortal(
          <div className={`invoice-print-area invoice-print-root invoice-format-${format}`}>
            <Layout invoice={invoice} format={format} />
          </div>,
          document.body,
        )}
    </div>
  );
}
