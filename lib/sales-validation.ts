import { z } from "zod";

const saleQuantity = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Enter a quantity with up to four decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const saleInputSchema = z.object({
  locationId: z.string().uuid(),
  taxMode: z.enum(["GST", "NON_GST"]),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().max(120).nullable().optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
  idempotencyKey: z.string().uuid(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    quantity: saleQuantity,
    saleUnit: z.enum(["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"]).optional(),
    createRemnant: z.boolean().optional().default(false),
    allocations: z.array(z.object({
      sourceType: z.enum(["STANDARD", "REMNANT"]),
      sourceId: z.string().uuid().nullable().optional(),
      quantity: saleQuantity,
    })).min(1).max(100).optional(),
  })).min(1).max(50),
}).superRefine((value, context) => {
  const keys = new Set<string>();
  value.lines.forEach((line, index) => {
    const key = `${line.productId}:${line.variantId || ""}:${line.saleUnit || ""}`;
    if (keys.has(key)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "Each product, variant and sales-unit combination may appear only once per invoice." });
    }
    keys.add(key);
  });
});

export const salesListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parseSalesList(searchParams: URLSearchParams) {
  return salesListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
  });
}

export const saleProductQuerySchema = z.object({
  locationId: z.string().uuid(),
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parseSaleProductQuery(searchParams: URLSearchParams) {
  return saleProductQuerySchema.safeParse({
    locationId: searchParams.get("locationId"),
    search: searchParams.get("search") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
  });
}
