import { z } from "zod";

const wholeQuantity = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Enter a quantity with up to four decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

const decimalQuantity = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Enter a quantity with up to four decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const saleReturnInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  locationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  lines: z.array(z.object({
    saleLineId: z.string().uuid(),
    quantity: wholeQuantity,
    disposition: z.enum(["RESTOCK", "DAMAGED"]),
  })).min(1).max(50),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.saleLineId)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "Each invoice line may appear only once." });
    }
    seen.add(line.saleLineId);
  });
});

export const purchaseReturnInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  locationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  lines: z.array(z.object({
    receiptLineId: z.string().uuid(),
    purchaseQuantity: decimalQuantity,
  })).min(1).max(100),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.receiptLineId)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "Each receipt line may appear only once." });
    }
    seen.add(line.receiptLineId);
  });
});

export const returnReversalInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
