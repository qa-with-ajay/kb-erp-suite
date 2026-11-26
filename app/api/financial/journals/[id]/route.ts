import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { journalInputSchema } from "@/lib/accounting-validation";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: RouteContext) {
  const access = await getBusinessUnitAccess("accounting.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid journal voucher ID." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = journalInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Journal voucher is invalid.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        select: { id: true, voucherNumber: true, status: true },
      });
      if (!existing) throw new Error("JOURNAL_NOT_FOUND");
      if (existing.status !== "DRAFT") throw new Error("JOURNAL_NOT_DRAFT");

      const entryDate = new Date(parsed.data.entryDate + "T00:00:00.000Z");
      const period = await tx.accountingPeriod.findFirst({
        where: { businessUnitId: access.context.businessUnit.id, status: "OPEN", startDate: { lte: entryDate }, endDate: { gte: entryDate } },
        select: { id: true, name: true },
      });
      if (!period) throw new Error("OPEN_ACCOUNTING_PERIOD_NOT_FOUND");

      const accountIds = [...new Set(parsed.data.lines.map((line) => line.accountId))];
      const accounts = await tx.account.findMany({
        where: { businessUnitId: access.context.businessUnit.id, id: { in: accountIds }, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== accountIds.length) throw new Error("ACCOUNT_NOT_AVAILABLE");

      await tx.journalLine.deleteMany({ where: { businessUnitId: access.context.businessUnit.id, journalEntryId: id } });
      await tx.journalLine.createMany({
        data: parsed.data.lines.map((line, index) => ({
          businessUnitId: access.context.businessUnit.id, journalEntryId: id, accountId: line.accountId,
          lineNumber: index + 1, description: line.description || null,
          debit: new Prisma.Decimal(line.debit), credit: new Prisma.Decimal(line.credit),
        })),
      });
      const updated = await tx.journalEntry.update({
        where: { id },
        data: { entryDate, periodId: period.id, narration: parsed.data.narration },
        include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { lineNumber: "asc" } } },
      });
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
          action: "UPDATE", entity: "JournalEntry", entityId: id,
          details: { voucherNumber: existing.voucherNumber, period: period.name, totalLines: parsed.data.lines.length },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ entry });
  } catch (error) {
    const messages: Record<string, { message: string; status: number }> = {
      JOURNAL_NOT_FOUND: { message: "Journal voucher was not found.", status: 404 },
      JOURNAL_NOT_DRAFT: { message: "Only draft vouchers can be edited.", status: 409 },
      OPEN_ACCOUNTING_PERIOD_NOT_FOUND: { message: "No open accounting period covers this voucher date.", status: 409 },
      ACCOUNT_NOT_AVAILABLE: { message: "One or more accounts are inactive or unavailable in this business unit.", status: 400 },
    };
    if (error instanceof Error && messages[error.message]) {
      const result = messages[error.message];
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const access = await getBusinessUnitAccess("accounting.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid journal voucher ID." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        select: { id: true, voucherNumber: true, status: true },
      });
      if (!existing) throw new Error("JOURNAL_NOT_FOUND");
      if (existing.status !== "DRAFT") throw new Error("JOURNAL_NOT_DRAFT");
      await tx.journalLine.deleteMany({ where: { businessUnitId: access.context.businessUnit.id, journalEntryId: id } });
      await tx.journalEntry.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
          action: "DELETE", entity: "JournalEntry", entityId: id,
          details: { voucherNumber: existing.voucherNumber },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "JOURNAL_NOT_FOUND") return NextResponse.json({ error: "Journal voucher was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "JOURNAL_NOT_DRAFT") return NextResponse.json({ error: "Only draft vouchers can be deleted." }, { status: 409 });
    throw error;
  }
}
