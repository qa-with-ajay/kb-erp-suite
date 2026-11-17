import { z } from "zod";

const amount = z.string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.")
  .refine((value) => {
    const [whole, fraction = ""] = value.split(".");
    const cents = `${whole}${(fraction + "00").slice(0, 2)}`.replace(/^0+(?=\d)/, "");
    return cents !== "0" && (cents.length < 14 || (cents.length === 14 && cents <= "99999999999999"));
  }, "Amount must be greater than zero and within the supported limit.");

const paymentDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid payment date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid payment date.");

export const paymentInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amount,
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  paidAt: paymentDate,
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const paymentReversalInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
