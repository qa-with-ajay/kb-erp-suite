import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const access = await getBusinessUnitAccess("accounting.post");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid journal voucher ID." }, { status: 400 });
  }

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const draft = await tx.journalEntry.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        include: { lines: true, period: true },
      });
      if (!draft) throw new Error("JOURNAL_NOT_FOUND");
      if (draft.status !== "DRAFT") throw new Error("JOURNAL_NOT_DRAFT");
      if (draft.period.status !== "OPEN" || draft.entryDate < draft.period.startDate || draft.entryDate > draft.period.endDate) {
        throw new Error("ACCOUNTING_PERIOD_CLOSED");
      }
      if (draft.lines.length < 2) throw new Error("JOURNAL_LINES_INVALID");
      const debit = draft.lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
      const credit = draft.lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
      if (debit.lte(0) || !debit.equals(credit)) throw new Error("JOURNAL_NOT_BALANCED");

      const accounts = await tx.account.findMany({
        where: { businessUnitId: draft.businessUnitId, id: { in: draft.lines.map((line) => line.accountId) }, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== new Set(draft.lines.map((line) => line.accountId)).size) throw new Error("ACCOUNT_NOT_AVAILABLE");

      const changed = await tx.journalEntry.updateMany({
        where: { id, businessUnitId: draft.businessUnitId, status: "DRAFT" },
        data: { status: "POSTED", postedBy: access.context.session.user.id, postedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("JOURNAL_STATE_CHANGED");

      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: draft.businessUnitId,
          action: "POST", entity: "JournalEntry", entityId: draft.id,
          details: { voucherNumber: draft.voucherNumber, debit: debit.toString(), credit: credit.toString() },
        },
      });
      return tx.journalEntry.findUniqueOrThrow({
        where: { id: draft.id },
        include: { lines: { include: { account: { select: { code: true, name: true } } } }, period: { select: { name: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ entry });
  } catch (error) {
    const messages: Record<string, { message: string; status: number }> = {
      JOURNAL_NOT_FOUND: { message: "Journal voucher was not found.", status: 404 },
      JOURNAL_NOT_DRAFT: { message: "Only draft vouchers can be posted.", status: 409 },
      ACCOUNTING_PERIOD_CLOSED: { message: "The accounting period is closed or does not cover this voucher date.", status: 409 },
      JOURNAL_LINES_INVALID: { message: "A journal voucher requires at least two lines.", status: 400 },
      JOURNAL_NOT_BALANCED: { message: "The journal voucher is not balanced. Debits must equal credits and be greater than zero.", status: 400 },
      ACCOUNT_NOT_AVAILABLE: { message: "One or more accounts are inactive or unavailable.", status: 409 },
      JOURNAL_STATE_CHANGED: { message: "The voucher changed while posting. Refresh and try again.", status: 409 },
    };
    if (error instanceof Error && messages[error.message]) {
      const result = messages[error.message];
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    throw error;
  }
}
