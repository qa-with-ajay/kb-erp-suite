import { z } from "zod";

const positiveQuantity = z.string()
  .trim()
  .regex(/^\d{1,14}(?:\.\d{1,4})?$/, "Enter a positive quantity with up to 4 decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");
const unitCost = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Enter a non-negative unit cost with up to 4 decimal places.");

const commonMovementFields = {
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: positiveQuantity,
  reference: z.string().trim().max(100).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().uuid(),
};

const inwardSchema = z.object({
  ...commonMovementFields,
  type: z.literal("INWARD"),
  locationId: z.string().uuid(),
  unitCost,
});
const outwardSchema = z.object({
  ...commonMovementFields,
  type: z.literal("OUTWARD"),
  locationId: z.string().uuid(),
});
const adjustmentSchema = z.object({
  ...commonMovementFields,
  type: z.literal("ADJUSTMENT"),
  locationId: z.string().uuid(),
  adjustmentDirection: z.enum(["INCREASE", "DECREASE"]),
  unitCost: unitCost.optional(),
}).superRefine((value, context) => {
  if (value.adjustmentDirection === "INCREASE" && value.unitCost === undefined) {
    context.addIssue({ code: "custom", path: ["unitCost"], message: "Unit cost is required for stock increases." });
  }
  if (!value.reason?.trim()) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for stock adjustments." });
  }
});
const transferSchema = z.object({
  ...commonMovementFields,
  type: z.literal("TRANSFER"),
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.sourceLocationId === value.destinationLocationId) {
    context.addIssue({ code: "custom", path: ["destinationLocationId"], message: "Choose a different destination location." });
  }
});

export const stockMovementInputSchema = z.discriminatedUnion("type", [
  inwardSchema, outwardSchema, adjustmentSchema, transferSchema,
]);

export const productStockEntrySchema = z.object({
  locationId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: positiveQuantity,
  unitCost,
  reference: z.string().trim().max(100).nullable().optional(),
  idempotencyKey: z.string().uuid(),
});

export const stockListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parseStockList(searchParams: URLSearchParams) {
  return stockListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
  });
}
