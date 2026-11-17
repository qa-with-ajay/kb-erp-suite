import { z } from "zod";

const quantity = z.string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, "Enter a quantity with up to four decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

const amount = z.string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, "Enter a valid non-negative amount.");

const percentage = z.string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a valid tax percentage.")
  .refine((value) => Number(value) <= 100, "Tax percentage cannot exceed 100.");

const measurementUnit = z.enum(["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"]);

export const purchaseOrderInputSchema = z.object({
  supplierId: z.string().uuid(),
  taxMode: z.enum(["GST", "NON_GST"]),
  idempotencyKey: z.string().uuid(),
  expectedDate: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    purchaseQuantity: quantity,
    purchaseUnit: measurementUnit,
    unitCost: amount,
    gstPercentage: percentage,
  })).min(1).max(100),
}).superRefine((value, context) => {
  const keys = new Set<string>();
  value.lines.forEach((line, index) => {
    const key = `${line.productId}:${line.variantId || ""}:${line.purchaseUnit}`;
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index],
        message: "Each product and variant may appear only once per purchase order.",
      });
    }
    keys.add(key);
  });
});

export const purchaseReceiptInputSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  locationId: z.string().uuid(),
  supplierInvoiceNumber: z.string().trim().min(1).max(100),
  supplierInvoiceDate: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().uuid(),
  lines: z.array(z.object({
    purchaseOrderLineId: z.string().uuid(),
    purchaseQuantity: quantity,
  })).min(1).max(100),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  value.lines.forEach((line, index) => {
    if (ids.has(line.purchaseOrderLineId)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "purchaseOrderLineId"],
        message: "Each order line may appear only once per receipt.",
      });
    }
    ids.add(line.purchaseOrderLineId);
  });
});

export const purchasesListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parsePurchasesList(searchParams: URLSearchParams) {
  return purchasesListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    status: searchParams.get("status") ?? undefined,
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
  });
}

export function parsePurchaseProductQuery(searchParams: URLSearchParams) {
  return purchasesListSchema.pick({ search: true, page: true, pageSize: true }).safeParse({
    search: searchParams.get("search") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "50",
  });
}
