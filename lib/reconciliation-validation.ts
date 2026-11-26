import { z } from "zod";

export const bankReconciliationInputSchema = z.object({
  paymentAccountId: z.string().uuid(),
  statementDate: z.string().date(),
  statementBalance: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/),
  transactionIds: z.array(z.string().uuid()).max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});
