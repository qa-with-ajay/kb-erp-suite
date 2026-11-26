import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { journalInputSchema } from "@/lib/accounting-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const entries = await prisma.journalEntry.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      ...(status && ["DRAFT", "POSTED", "REVERSED"].includes(status) ? { status: status as "DRAFT" | "POSTED" | "REVERSED" } : {}),
      ...(params.get("from") || params.get("to") ? { entryDate: {
        ...(params.get("from") ? { gte: new Date(params.get("from")! + "T00:00:00.000Z") } : {}),
        ...(params.get("to") ? { lte: new Date(params.get("to")! + "T00:00:00.000Z") } : {}),
      } } : {}),
    },
    include: {
      period: { select: { name: true, status: true } },
      lines: { include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { lineNumber: "asc" } },
      creator: { select: { id: true, name: true } },
      poster: { select: { id: true, name: true } },
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("accounting.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = journalInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Journal voucher is invalid.", details: parsed.error.flatten() }, { status: 400 });

  const businessUnitId = access.context.businessUnit.id;
  const entryDate = new Date(parsed.data.entryDate + "T00:00:00.000Z");
  const totalDebit = parsed.data.lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.debit)), new Prisma.Decimal(0));
  const totalCredit = parsed.data.lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.credit)), new Prisma.Decimal(0));
  if (!totalDebit.equals(totalCredit) || totalDebit.lte(0)) return NextResponse.json({ error: "Journal debits and credits must be equal and greater than zero." }, { status: 400 });

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findFirst({
        where: { businessUnitId, status: "OPEN", startDate: { lte: entryDate }, endDate: { gte: entryDate } },
        select: { id: true, name: true },
      });
      if (!period) throw new Error("OPEN_ACCOUNTING_PERIOD_NOT_FOUND");

      const accountIds = [...new Set(parsed.data.lines.map((line) => line.accountId))];
      const accounts = await tx.account.findMany({
        where: { businessUnitId, id: { in: accountIds }, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== accountIds.length) throw new Error("ACCOUNT_NOT_AVAILABLE");

      const id = randomUUID();
      const voucherNumber = `JV-${parsed.data.entryDate.replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
      const created = await tx.journalEntry.create({
        data: {
          id, businessUnitId, periodId: period.id, voucherNumber, entryDate,
          narration: parsed.data.narration, createdBy: access.context.session.user.id,
          idempotencyKey: `manual:${id}`,
          lines: {
            create: parsed.data.lines.map((line, index) => ({
              businessUnitId, accountId: line.accountId, lineNumber: index + 1,
              description: line.description || null,
              debit: new Prisma.Decimal(line.debit), credit: new Prisma.Decimal(line.credit),
            })),
          },
        },
        include: { lines: { include: { account: { select: { code: true, name: true } } } }, period: { select: { name: true } } },
      });
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId, action: "CREATE",
          entity: "JournalEntry", entityId: created.id,
          details: { voucherNumber, totalDebit: totalDebit.toString(), period: period.name },
        },
      });
      return created;
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "OPEN_ACCOUNTING_PERIOD_NOT_FOUND") return NextResponse.json({ error: "No open accounting period covers this voucher date." }, { status: 400 });
    if (error instanceof Error && error.message === "ACCOUNT_NOT_AVAILABLE") return NextResponse.json({ error: "One or more accounts are inactive or unavailable in this business unit." }, { status: 400 });
    throw error;
  }
}
