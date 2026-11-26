import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { bankReconciliationInputSchema } from "@/lib/reconciliation-validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const access = await getBusinessUnitAccess("cashbank.reconcile");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = bankReconciliationInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reconciliation details.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const input = parsed.data;
  const statementDate = new Date(input.statementDate + "T00:00:00.000Z");
  const openingBalance = new Prisma.Decimal(input.openingBalance);
  const statementBalance = new Prisma.Decimal(input.statementBalance);
  try {
    const reconciliation = await prisma.$transaction(async (tx) => {
      const current = await tx.bankReconciliation.findFirst({ where: { id, businessUnitId }, select: { id: true, status: true } });
      if (!current) throw new Error("RECONCILIATION_NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("RECONCILIATION_NOT_DRAFT");
      const account = await tx.paymentAccount.findFirst({
        where: { id: input.paymentAccountId, businessUnitId, isActive: true, type: { in: ["BANK", "UPI"] } },
        select: { id: true },
      });
      if (!account) throw new Error("BANK_ACCOUNT_NOT_FOUND");
      await tx.bankReconciliationItem.deleteMany({ where: { businessUnitId, reconciliationId: id } });
      const transactions = input.transactionIds.length ? await tx.cashBankTransaction.findMany({
        where: {
          businessUnitId, id: { in: input.transactionIds }, transactionDate: { lte: statementDate },
          OR: [{ paymentAccountId: account.id }, { destinationAccountId: account.id }],
          reconciliationItems: { none: {} }, journalEntry: { status: "POSTED" },
        },
        select: { id: true, type: true, amount: true, destinationAccountId: true },
      }) : [];
      if (transactions.length !== new Set(input.transactionIds).size) throw new Error("RECONCILIATION_TRANSACTION_INVALID");
      const movementTotal = transactions.reduce((sum, transaction) => {
        if (transaction.destinationAccountId === account.id) return sum.plus(transaction.amount);
        return transaction.type === "RECEIPT" ? sum.plus(transaction.amount) : sum.minus(transaction.amount);
      }, new Prisma.Decimal(0));
      const bookBalance = openingBalance.plus(movementTotal);
      const difference = statementBalance.minus(bookBalance);
      const updated = await tx.bankReconciliation.update({
        where: { id },
        data: {
          paymentAccountId: account.id, statementDate, openingBalance, statementBalance,
          bookBalance, difference, notes: input.notes || null,
          items: { create: transactions.map((transaction) => ({ businessUnitId, transactionId: transaction.id })) },
        },
        include: { paymentAccount: { select: { id: true, name: true, type: true } }, _count: { select: { items: true } } },
      });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId, action: "UPDATE",
        entity: "BankReconciliation", entityId: id,
        details: { statementDate: input.statementDate, difference: difference.toFixed(2), matchedTransactions: transactions.length },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ reconciliation });
  } catch (error) {
    if (error instanceof Error && error.message === "RECONCILIATION_NOT_FOUND") return NextResponse.json({ error: "Reconciliation was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "RECONCILIATION_NOT_DRAFT") return NextResponse.json({ error: "Only draft reconciliations can be edited." }, { status: 409 });
    if (error instanceof Error && error.message === "BANK_ACCOUNT_NOT_FOUND") return NextResponse.json({ error: "Choose an active bank or UPI account." }, { status: 400 });
    if (error instanceof Error && error.message === "RECONCILIATION_TRANSACTION_INVALID") return NextResponse.json({ error: "One or more selected transactions are unavailable, already reconciled, or after the statement date." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "A concurrent reconciliation update occurred. Refresh and retry." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, context: Context) {
  const access = await getBusinessUnitAccess("cashbank.reconcile");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.bankReconciliation.findFirst({ where: { id, businessUnitId: access.context.businessUnit.id }, select: { id: true, status: true } });
      if (!current) throw new Error("RECONCILIATION_NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("RECONCILIATION_NOT_DRAFT");
      await tx.bankReconciliation.delete({ where: { id } });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
        action: "DELETE", entity: "BankReconciliation", entityId: id,
      } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "RECONCILIATION_NOT_FOUND") return NextResponse.json({ error: "Reconciliation was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "RECONCILIATION_NOT_DRAFT") return NextResponse.json({ error: "Completed reconciliations cannot be deleted." }, { status: 409 });
    throw error;
  }
}
