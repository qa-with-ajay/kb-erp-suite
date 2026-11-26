import { z } from "zod";

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).refine((value) => Number(value) > 0, "Amount must be greater than zero.");
const date = z.string().date();

export const paymentAccountInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["CASH", "BANK", "UPI"]),
  ledgerAccountId: z.string().uuid(),
  bankName: z.string().trim().max(100).optional().nullable(),
  accountNumberLast4: z.string().regex(/^\d{4}$/).or(z.literal("")).optional().nullable(),
  ifsc: z.string().trim().max(11).optional().nullable(),
  upiId: z.string().trim().max(100).optional().nullable(),
});

export const cashBankTransactionInputSchema = z.object({
  type: z.enum(["RECEIPT", "PAYMENT", "TRANSFER"]),
  paymentAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid().optional().nullable(),
  offsetAccountId: z.string().uuid().optional().nullable(),
  amount: money,
  transactionDate: date,
  reference: z.string().trim().max(100).optional().nullable(),
  narration: z.string().trim().min(3).max(300),
}).superRefine((value, ctx) => {
  if (value.type === "TRANSFER") {
    if (!value.destinationAccountId || value.destinationAccountId === value.paymentAccountId || value.offsetAccountId) {
      ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Choose a different destination payment account for a transfer." });
    }
  } else if (!value.offsetAccountId || value.destinationAccountId) {
    ctx.addIssue({ code: "custom", path: ["offsetAccountId"], message: "Choose an offset ledger account for a receipt or payment." });
  }
});

export const expenseCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  expenseAccountId: z.string().uuid(),
});

export const expenseInputSchema = z.object({
  categoryId: z.string().uuid(),
  paymentAccountId: z.string().uuid(),
  expenseDate: date,
  amount: money,
  description: z.string().trim().min(3).max(300),
  reference: z.string().trim().max(100).optional().nullable(),
});
