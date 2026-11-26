import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const access = await getBusinessUnitAccess("accounting.post");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid journal voucher ID." }, { status: 400 });
  }
  let reason = "Journal voucher reversal";
  try {
    const body = await request.json();
    if (body && typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim().slice(0, 500);
  } catch { /* An optional reason may be omitted. */ }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        include: { lines: true },
      });
      if (!original) throw new Error("JOURNAL_NOT_FOUND");
      if (original.status !== "POSTED" || original.reversedByEntryId) throw new Error("JOURNAL_NOT_REVERSIBLE");

      const reversalDate = new Date();
      reversalDate.setUTCHours(0, 0, 0, 0);
      const period = await tx.accountingPeriod.findFirst({
        where: { businessUnitId: original.businessUnitId, status: "OPEN", startDate: { lte: reversalDate }, endDate: { gte: reversalDate } },
        select: { id: true, name: true },
      });
      if (!period) throw new Error("OPEN_ACCOUNTING_PERIOD_NOT_FOUND");

      const reversalId = randomUUID();
      const voucherNumber = `JVR-${reversalDate.toISOString().slice(0, 10).replaceAll("-", "")}-${reversalId.slice(0, 8).toUpperCase()}`;
      const reversal = await tx.journalEntry.create({
        data: {
          id: reversalId,
          businessUnitId: original.businessUnitId,
          periodId: period.id,
          voucherNumber,
          entryDate: reversalDate,
          narration: `Reversal of ${original.voucherNumber}: ${reason}`,
          status: "DRAFT",
          sourceType: "JOURNAL_REVERSAL",
          sourceId: original.id,
          idempotencyKey: `journal-reversal:${original.id}`,
          createdBy: access.context.session.user.id,
          postedBy: access.context.session.user.id,
          postedAt: new Date(),
          lines: {
            create: original.lines.map((line, index) => ({
              businessUnitId: original.businessUnitId,
              accountId: line.accountId,
              lineNumber: index + 1,
              description: `Reversal: ${line.description ?? original.narration}`,
              debit: new Prisma.Decimal(line.credit),
              credit: new Prisma.Decimal(line.debit),
            })),
          },
        },
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      });
      const postedReversal = await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { status: "POSTED", postedBy: access.context.session.user.id, postedAt: new Date() },
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      });
      const changed = await tx.journalEntry.updateMany({
        where: { id: original.id, businessUnitId: original.businessUnitId, status: "POSTED", reversedByEntryId: null },
        data: { status: "REVERSED", reversedByEntryId: reversal.id },
      });
      if (changed.count !== 1) throw new Error("JOURNAL_STATE_CHANGED");
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: original.businessUnitId,
          action: "REVERSE", entity: "JournalEntry", entityId: original.id,
          details: { originalVoucher: original.voucherNumber, reversalVoucher: voucherNumber, reason },
        },
      });
      return postedReversal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ reversal: result }, { status: 201 });
  } catch (error) {
    const messages: Record<string, { message: string; status: number }> = {
      JOURNAL_NOT_FOUND: { message: "Journal voucher was not found.", status: 404 },
      JOURNAL_NOT_REVERSIBLE: { message: "Only posted vouchers that have not already been reversed can be reversed.", status: 409 },
      OPEN_ACCOUNTING_PERIOD_NOT_FOUND: { message: "No open accounting period covers today's reversal date.", status: 409 },
      JOURNAL_STATE_CHANGED: { message: "The voucher changed while reversal was processing. Refresh and try again.", status: 409 },
    };
    if (error instanceof Error && messages[error.message]) {
      const result = messages[error.message];
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A reversal already exists for this voucher." }, { status: 409 });
    }
    throw error;
  }
}
