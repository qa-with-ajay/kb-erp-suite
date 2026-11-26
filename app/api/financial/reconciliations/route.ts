import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { bankReconciliationInputSchema } from "@/lib/reconciliation-validation";

export async function GET() {
  const access = await getBusinessUnitAccess("cashbank.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const reconciliations = await prisma.bankReconciliation.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    include: {
      paymentAccount: { select: { id: true, name: true, type: true } },
      creator: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ statementDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({ reconciliations });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("cashbank.reconcile");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = bankReconciliationInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reconciliation details.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const input = parsed.data;
  const statementDate = new Date(input.statementDate + "T00:00:00.000Z");
  const statementBalance = new Prisma.Decimal(input.statementBalance);

  try {
    const reconciliation = await prisma.$transaction(async (tx) => {
      const account = await tx.paymentAccount.findFirst({
        where: { id: input.paymentAccountId, businessUnitId, isActive: true, type: { in: ["BANK", "UPI"] } },
        include: { ledgerAccount: { select: { id: true } } },
      });
      if (!account) throw new Error("BANK_ACCOUNT_NOT_FOUND");
      const transactions = input.transactionIds.length ? await tx.cashBankTransaction.findMany({
        where: {
          businessUnitId,
          id: { in: input.transactionIds },
          transactionDate: { lte: statementDate },
          OR: [{ paymentAccountId: account.id }, { destinationAccountId: account.id }],
          reconciliationItems: { none: {} },
        },
        select: { id: true },
      }) : [];
      if (transactions.length !== new Set(input.transactionIds).size) throw new Error("RECONCILIATION_TRANSACTION_INVALID");

      const totals = await tx.journalLine.aggregate({
        where: {
          businessUnitId,
          accountId: account.ledgerAccountId,
          journalEntry: { businessUnitId, status: "POSTED", entryDate: { lte: statementDate } },
        },
        _sum: { debit: true, credit: true },
      });
      const bookBalance = (totals._sum.debit ?? new Prisma.Decimal(0)).minus(totals._sum.credit ?? new Prisma.Decimal(0));
      const difference = statementBalance.minus(bookBalance);
      const created = await tx.bankReconciliation.create({
        data: {
          businessUnitId, paymentAccountId: account.id, statementDate, statementBalance,
          bookBalance, difference, status: "DRAFT", notes: input.notes || null,
          createdBy: access.context.session.user.id,
          items: { create: transactions.map((transaction) => ({ businessUnitId, transactionId: transaction.id })) },
        },
        include: {
          paymentAccount: { select: { id: true, name: true, type: true } },
          _count: { select: { items: true } },
        },
      });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId, action: "CREATE",
        entity: "BankReconciliation", entityId: created.id,
        details: { statementDate: input.statementDate, statementBalance: statementBalance.toFixed(2), bookBalance: bookBalance.toFixed(2), difference: difference.toFixed(2), matchedTransactions: transactions.length },
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ reconciliation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BANK_ACCOUNT_NOT_FOUND") return NextResponse.json({ error: "Choose an active bank or UPI account." }, { status: 400 });
    if (error instanceof Error && error.message === "RECONCILIATION_TRANSACTION_INVALID") return NextResponse.json({ error: "One or more transactions do not belong to this account, are after the statement date, or were already reconciled." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "A concurrent reconciliation was created. Refresh and retry." }, { status: 409 });
    throw error;
  }
}
