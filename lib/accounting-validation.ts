import { z } from "zod";

export const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);

export const accountInputSchema = z.object({
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(2).max(100),
  type: accountTypeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  parentAccountId: z.string().uuid().optional().nullable(),
});

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(250).optional().nullable(),
  debit: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).default("0"),
  credit: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).default("0"),
});

export const journalInputSchema = z.object({
  entryDate: z.string().date(),
  narration: z.string().trim().min(3).max(500),
  lines: z.array(journalLineSchema).min(2).max(100),
}).superRefine((value, ctx) => {
  let debit = 0;
  let credit = 0;
  value.lines.forEach((line, index) => {
    const d = Number(line.debit);
    const c = Number(line.credit);
    if ((d > 0) === (c > 0)) {
      ctx.addIssue({ code: "custom", path: ["lines", index], message: "Each line must contain either a debit or a credit amount, not both." });
    }
    debit += d;
    credit += c;
  });
  if (!Number.isFinite(debit) || !Number.isFinite(credit) || Math.round(debit * 100) !== Math.round(credit * 100)) {
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Total debits must equal total credits." });
  }
});
