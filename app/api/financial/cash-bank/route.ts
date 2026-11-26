import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { cashBankTransactionInputSchema } from "@/lib/finance-validation";
import { getBusinessDateUtc } from "@/lib/accounting-date";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("cashbank.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const accountId = params.get("accountId");
  const validDate = (value: string | null) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime()));
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return NextResponse.json({ error: "Invalid transaction date range." }, { status: 400 });
  const transactions = await prisma.cashBankTransaction.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      journalEntry: { status: "POSTED" },
      ...(accountId ? { OR: [{ paymentAccountId: accountId }, { destinationAccountId: accountId }] } : {}),
      ...(from || to ? { transactionDate: { ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}), ...(to ? { lte: new Date(to + "T00:00:00.000Z") } : {}) } } : {}),
    },
    include: {
      paymentAccount: { select: { id: true, name: true, type: true } },
      destinationAccount: { select: { id: true, name: true, type: true } },
      offsetAccount: { select: { id: true, code: true, name: true } },
      journalEntry: { select: { voucherNumber: true, status: true } },
      reconciliationItems: { select: { id: true } },
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: 250,
  });
  return NextResponse.json({ transactions });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("cashbank.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = cashBankTransactionInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cash/bank transaction.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const actorId = access.context.session.user.id;
  const input = parsed.data;
  const amount = new Prisma.Decimal(input.amount);
  const transactionDate = new Date(input.transactionDate + "T00:00:00.000Z");
  try {
    const transaction = await prisma.$transaction(async (tx) => {
      const source = await tx.paymentAccount.findFirst({
        where: { id: input.paymentAccountId, businessUnitId, isActive: true },
        include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
      });
      if (!source) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
      let destination: typeof source | null = null;
      let offset: { id: string; code: string; name: string } | null = null;
      if (input.type === "TRANSFER") {
        destination = await tx.paymentAccount.findFirst({
          where: { id: input.destinationAccountId!, businessUnitId, isActive: true },
          include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
        });
        if (!destination || destination.id === source.id) throw new Error("DESTINATION_ACCOUNT_NOT_FOUND");
      } else {
        offset = await tx.account.findFirst({
          where: { id: input.offsetAccountId!, businessUnitId, isActive: true, isControlAccount: false },
          select: { id: true, code: true, name: true },
        });
        if (!offset) throw new Error("OFFSET_ACCOUNT_NOT_FOUND");
      }
      const period = await tx.accountingPeriod.findFirst({
        where: { businessUnitId, status: "OPEN", startDate: { lte: transactionDate }, endDate: { gte: transactionDate } },
        select: { id: true },
      });
      if (!period) throw new Error("OPEN_ACCOUNTING_PERIOD_NOT_FOUND");

      const debitAccountId = input.type === "RECEIPT" ? source.ledgerAccount.id : input.type === "TRANSFER" ? destination!.ledgerAccount.id : offset!.id;
      const creditAccountId = input.type === "PAYMENT" ? source.ledgerAccount.id : input.type === "TRANSFER" ? source.ledgerAccount.id : offset!.id;
      const id = randomUUID();
      const voucherNumber = `CB-${input.transactionDate.replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
      const journal = await tx.journalEntry.create({
        data: {
          id, businessUnitId, periodId: period.id, voucherNumber, entryDate: transactionDate,
          narration: input.narration, sourceType: "CASH_BANK", sourceId: id,
          idempotencyKey: `cashbank:${id}`, createdBy: actorId,
          lines: { create: [
            { businessUnitId, accountId: debitAccountId, lineNumber: 1, description: input.narration, debit: amount, credit: new Prisma.Decimal(0) },
            { businessUnitId, accountId: creditAccountId, lineNumber: 2, description: input.narration, debit: new Prisma.Decimal(0), credit: amount },
          ] },
        },
        select: { id: true, voucherNumber: true },
      });
      await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedBy: actorId, postedAt: new Date() } });
      const transactionNumber = voucherNumber;
      const created = await tx.cashBankTransaction.create({
        data: {
          id, businessUnitId, transactionNumber, type: input.type, paymentAccountId: source.id,
          destinationAccountId: destination?.id ?? null, offsetAccountId: offset?.id ?? null,
          amount, transactionDate, reference: input.reference || null, narration: input.narration,
          journalEntryId: journal.id, createdBy: actorId,
        },
        include: {
          paymentAccount: { select: { id: true, name: true, type: true } },
          destinationAccount: { select: { id: true, name: true, type: true } },
          offsetAccount: { select: { id: true, code: true, name: true } },
          journalEntry: { select: { voucherNumber: true, status: true } },
        },
      });
      await tx.auditLog.create({ data: {
        userId: actorId, businessUnitId, action: "CREATE", entity: "CashBankTransaction", entityId: created.id,
        details: { transactionNumber, type: input.type, amount: amount.toFixed(2), reference: input.reference || null },
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = {
      PAYMENT_ACCOUNT_NOT_FOUND: "The selected payment account is inactive or unavailable.",
      DESTINATION_ACCOUNT_NOT_FOUND: "The destination payment account is inactive or unavailable.",
      OFFSET_ACCOUNT_NOT_FOUND: "The selected offset ledger account is inactive or unavailable.",
      OPEN_ACCOUNTING_PERIOD_NOT_FOUND: "No open accounting period covers this transaction date.",
    };
    if (error instanceof Error && messages[error.message]) return NextResponse.json({ error: messages[error.message] }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "A concurrent financial update occurred. Refresh and retry." }, { status: 409 });
    throw error;
  }
}
