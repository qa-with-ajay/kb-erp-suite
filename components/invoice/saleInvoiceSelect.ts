import type { Prisma } from "@prisma/client";

/** Single source of truth for what the invoice page loads. Every field verified against schema.prisma. */
export const saleInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  taxMode: true,
  customerName: true,
  customerPhone: true,
  subtotal: true,
  taxAmount: true,
  total: true,
  createdAt: true,
  creator: { select: { name: true } },
  customer: {
    select: { name: true, phone: true, gstin: true, addressLine1: true, city: true, state: true, pincode: true },
  },
  payments: { select: { amount: true, method: true, reversedAt: true } },
  returns: { select: { total: true, reversedAt: true } },
  businessUnit: {
    select: {
      name: true,
      profile: {
        select: {
          legalName: true, tradeName: true, gstin: true, phone: true, email: true,
          addressLine1: true, addressLine2: true, city: true, state: true, stateCode: true,
          pincode: true, currency: true,
        },
      },
    },
  },
  stockMovement: { select: { sourceLocation: { select: { name: true } } } },
  lines: {
    select: {
      id: true, lineNumber: true, productName: true, sku: true, baseUnit: true,
      variantCode: true, variantAttributes: true, quantity: true, unitPrice: true,
      gstPercentage: true, lineSubtotal: true, lineTax: true, lineTotal: true,
    },
    orderBy: { lineNumber: "asc" },
  },
} satisfies Prisma.SaleSelect;

export type SaleForInvoice = Prisma.SaleGetPayload<{ select: typeof saleInvoiceSelect }>;
