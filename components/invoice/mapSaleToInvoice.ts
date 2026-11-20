import { Prisma } from "@prisma/client";
import { amountInWordsINR } from "./amountInWords";
import type { GstMode, InvoiceData, InvoiceItem, TaxSummaryRow } from "./invoiceTypes";
import type { SaleForInvoice } from "./saleInvoiceSelect";

const D = Prisma.Decimal;
const paise = (v: Prisma.Decimal) => Math.round(v.mul(100).toNumber());
const rupees = (p: number) => p / 100;
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

function formatVariant(code: string | null, attributes: unknown) {
  const entries =
    attributes && typeof attributes === "object" && !Array.isArray(attributes)
      ? Object.entries(attributes).map(([k, v]) => `${k}: ${String(v)}`)
      : [];
  return [code, ...entries].filter(Boolean).join(" · ");
}

/**
 * Presentation adapter only. Stored Sale/SaleLine amounts are used as-is.
 * The ONLY derived value is the CGST/SGST split of the stored lineTax (see resolveGstMode / split below).
 */
export function mapSaleToInvoice(sale: SaleForInvoice): InvoiceData {
  const profile = sale.businessUnit.profile;
  const currency = profile?.currency || "INR";

  // Schema stores only GST | NON_GST. Inter-state is derived: both states known AND different.
  // Unknown customer state (e.g. walk-in) => intra-state.
  const customerState = sale.customer?.state ?? undefined;
  const gstMode: GstMode =
    sale.taxMode !== "GST"
      ? "NONE"
      : norm(profile?.state) && norm(customerState) && norm(profile?.state) !== norm(customerState)
        ? "INTER_STATE"
        : "INTRA_STATE";

  let cgstP = 0, sgstP = 0, igstP = 0;
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();

  const items: InvoiceItem[] = sale.lines.map((l) => {
    const taxP = paise(l.lineTax);
    const cgst = gstMode === "INTRA_STATE" ? Math.floor(taxP / 2) : 0;
    const sgst = gstMode === "INTRA_STATE" ? taxP - cgst : 0; // odd paisa goes to SGST so halves always sum to lineTax
    const igst = gstMode === "INTER_STATE" ? taxP : 0;
    cgstP += cgst; sgstP += sgst; igstP += igst;

    const rate = Number(l.gstPercentage);
    const row = byRate.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += paise(l.lineSubtotal); row.cgst += cgst; row.sgst += sgst; row.igst += igst;
    byRate.set(rate, row);

    const variant = formatVariant(l.variantCode, l.variantAttributes);
    return {
      id: l.id,
      description: l.productName,
      detail: [l.sku, variant].filter(Boolean).join(" · ") || undefined,
      quantity: l.quantity.toString(),
      unit: l.baseUnit,
      rate: l.unitPrice.toNumber(),
      taxableAmount: l.lineSubtotal.toNumber(),
      gstRate: rate,
      cgstAmount: rupees(cgst),
      sgstAmount: rupees(sgst),
      igstAmount: rupees(igst),
      taxAmount: l.lineTax.toNumber(),
      totalAmount: l.lineTotal.toNumber(),
    };
  });

  const taxSummary: TaxSummaryRow[] =
    gstMode === "NONE"
      ? []
      : [...byRate.entries()].sort(([a], [b]) => a - b).map(([rate, r]) => ({
          rate, taxable: rupees(r.taxable), cgst: rupees(r.cgst), sgst: rupees(r.sgst), igst: rupees(r.igst),
        }));

  // Same Decimal logic as the existing invoice page, so balances match the screen exactly.
  const paid = sale.payments.reduce((t, p) => (p.reversedAt ? t : t.plus(p.amount)), new D(0));
  const returned = sale.returns.reduce((t, r) => (r.reversedAt ? t : t.plus(r.total)), new D(0));
  const net = sale.total.minus(returned).minus(paid);

  // Integrity checks against authoritative header totals (log only; never alter amounts).
  const sumTax = sale.lines.reduce((t, l) => t.plus(l.lineTax), new D(0));
  const sumSub = sale.lines.reduce((t, l) => t.plus(l.lineSubtotal), new D(0));
  if (!sumTax.equals(sale.taxAmount)) console.warn(`[invoice ${sale.invoiceNumber}] sum(lineTax) ${sumTax} != taxAmount ${sale.taxAmount}`);
  if (!sumSub.equals(sale.subtotal)) console.warn(`[invoice ${sale.invoiceNumber}] sum(lineSubtotal) ${sumSub} != subtotal ${sale.subtotal}`);
  if (!sale.subtotal.plus(sale.taxAmount).equals(sale.total)) console.warn(`[invoice ${sale.invoiceNumber}] subtotal+tax != total (round-off or discount exists?)`);

  const byMethod = new Map<string, Prisma.Decimal>();
  for (const p of sale.payments) if (!p.reversedAt) byMethod.set(p.method, (byMethod.get(p.method) ?? new D(0)).plus(p.amount));

  const c = sale.customer;
  const customerAddress = c ? [c.addressLine1, c.city, c.state, c.pincode].filter(Boolean).join(", ") : "";
  const sellerAddress = profile
    ? [profile.addressLine1, profile.addressLine2, profile.city, profile.state, profile.pincode].filter(Boolean).join(", ")
    : "";

  return {
    invoiceNumber: sale.invoiceNumber,
    invoiceDate: sale.createdAt.toISOString(),
    gstMode,
    currency,
    seller: {
      name: profile?.tradeName || sale.businessUnit.name,
      legalName: profile?.legalName && profile.legalName !== profile.tradeName ? profile.legalName : undefined,
      address: sellerAddress,
      gstin: profile?.gstin ?? undefined,
      phone: profile?.phone ?? undefined,
      email: profile?.email ?? undefined,
      state: profile?.state ?? undefined,
      stateCode: profile?.stateCode ?? undefined,
    },
    customer: {
      name: sale.customerName || c?.name || "Walk-in customer",
      address: customerAddress || undefined,
      gstin: c?.gstin ?? undefined,
      phone: sale.customerPhone || c?.phone || undefined,
      state: customerState,
    },
    placeOfSupply: gstMode === "NONE" ? undefined : customerState || profile?.state || undefined,
    items,
    taxSummary,
    totals: {
      subtotal: sale.subtotal.toNumber(),
      tax: sale.taxAmount.toNumber(),
      cgst: rupees(cgstP),
      sgst: rupees(sgstP),
      igst: rupees(igstP),
      total: sale.total.toNumber(),
      paid: paid.toNumber(),
      returns: returned.toNumber(),
      balanceDue: net.greaterThan(0) ? net.toNumber() : 0,
      credit: net.isNegative() ? net.abs().toNumber() : 0,
    },
    payments: [...byMethod.entries()].map(([method, amount]) => ({ method, amount: amount.toNumber() })),
    amountInWords: currency === "INR" ? amountInWordsINR(sale.total.toNumber()) : undefined,
    issuedBy: sale.creator.name,
    location: sale.stockMovement.sourceLocation?.name,
  };
}
