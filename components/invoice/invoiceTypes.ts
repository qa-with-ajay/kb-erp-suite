export type InvoicePrintFormat = "a4" | "thermal-80" | "thermal-58";

/** NONE = Non-GST invoice. INTRA = CGST+SGST. INTER = IGST. */
export type GstMode = "NONE" | "INTRA_STATE" | "INTER_STATE";

export interface InvoiceItem {
  id: string;
  description: string;
  /** SKU / variant line shown under the description. */
  detail?: string;
  /** Not present in the current Prisma schema; column is hidden unless some item has it. */
  hsnSac?: string;
  quantity: string;
  unit: string;
  rate: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface TaxSummaryRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  /** ISO string (serialisable across the server/client boundary). */
  invoiceDate: string;
  gstMode: GstMode;
  currency: string;
  seller: {
    name: string;
    legalName?: string;
    address: string;
    gstin?: string;
    phone?: string;
    email?: string;
    state?: string;
    stateCode?: string;
    logoUrl?: string;
  };
  customer: {
    name: string;
    address?: string;
    gstin?: string;
    phone?: string;
    state?: string;
  };
  placeOfSupply?: string;
  items: InvoiceItem[];
  taxSummary: TaxSummaryRow[];
  totals: {
    subtotal: number;
    tax: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    paid: number;
    returns: number;
    balanceDue: number;
    credit: number;
  };
  payments: { method: string; amount: number }[];
  amountInWords?: string;
  issuedBy?: string;
  location?: string;
  notes?: string;
}
