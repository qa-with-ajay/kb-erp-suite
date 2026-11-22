import { z } from "zod";

const movementTypes = ["INWARD", "OUTWARD", "ADJUSTMENT"] as const;
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

const regularMovementSchema = z.object({
  ...commonMovementFields,
  type: z.enum(movementTypes),
  locationId: z.string().uuid(),
  adjustmentDirection: z.enum(["INCREASE", "DECREASE"]).optional(),
  unitCost: unitCost.optional(),
}).superRefine((value, context) => {
  const costRequired = value.type === "INWARD" ||
    (value.type === "ADJUSTMENT" && value.adjustmentDirection === "INCREASE");
  if (costRequired && value.unitCost === undefined) {
    context.addIssue({ code: "custom", path: ["unitCost"], message: "Unit cost is required for stock increases." });
  }
  if (value.type === "ADJUSTMENT" && !value.adjustmentDirection) {
    context.addIssue({ code: "custom", path: ["adjustmentDirection"], message: "Choose whether the adjustment increases or decreases stock." });
  }
  if (value.type !== "ADJUSTMENT" && value.adjustmentDirection !== undefined) {
    context.addIssue({ code: "custom", path: ["adjustmentDirection"], message: "Adjustment direction is only valid for an adjustment." });
  }
  if (value.type === "ADJUSTMENT" && !value.reason?.trim()) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for stock adjustments." });
  }
});

const transferMovementSchema = z.object({
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
  regularMovementSchema.extend({ type: z.literal("INWARD") }),
  regularMovementSchema.extend({ type: z.literal("OUTWARD"), unitCost: z.never().optional() }),
  regularMovementSchema.extend({ type: z.literal("ADJUSTMENT") }),
  transferMovementSchema,
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
