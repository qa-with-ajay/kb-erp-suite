import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const access = await getBusinessUnitAccess("cashbank.reconcile");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  try {
    const reconciliation = await prisma.$transaction(async (tx) => {
      const current = await tx.bankReconciliation.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        include: { paymentAccount: { select: { ledgerAccountId: true, name: true } }, items: { include: { transaction: { select: { type: true, amount: true, paymentAccountId: true, destinationAccountId: true } } } } },
      });
      if (!current) throw new Error("RECONCILIATION_NOT_FOUND");
      if (current.status === "RECONCILED") throw new Error("RECONCILIATION_ALREADY_CLOSED");
      const movementTotal = current.items.reduce((sum, item) => {
        const transaction = item.transaction;
        if (transaction.destinationAccountId === current.paymentAccountId) return sum.plus(transaction.amount);
        return transaction.type === "RECEIPT" ? sum.plus(transaction.amount) : sum.minus(transaction.amount);
      }, new Prisma.Decimal(0));
      const bookBalance = current.openingBalance.plus(movementTotal);
      const difference = current.statementBalance.minus(bookBalance);
      if (!difference.isZero()) throw new Error(`RECONCILIATION_DIFFERENCE:${difference.toFixed(2)}`);
      const updated = await tx.bankReconciliation.update({
        where: { id: current.id },
        data: { bookBalance, difference, status: "RECONCILED", reconciledAt: new Date() },
        include: {
          paymentAccount: { select: { id: true, name: true, type: true } },
          _count: { select: { items: true } },
        },
      });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
        action: "RECONCILE", entity: "BankReconciliation", entityId: current.id,
        details: { account: current.paymentAccount.name, statementDate: current.statementDate.toISOString().slice(0, 10), balance: bookBalance.toFixed(2) },
      } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ reconciliation });
  } catch (error) {
    if (error instanceof Error && error.message === "RECONCILIATION_NOT_FOUND") return NextResponse.json({ error: "Reconciliation was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "RECONCILIATION_ALREADY_CLOSED") return NextResponse.json({ error: "This reconciliation is already completed." }, { status: 409 });
    if (error instanceof Error && error.message.startsWith("RECONCILIATION_DIFFERENCE:")) return NextResponse.json({ error: `Statement and book balances differ by ₹${error.message.split(":")[1]}. Resolve the difference before completing reconciliation.` }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "A concurrent reconciliation update occurred. Refresh and retry." }, { status: 409 });
    throw error;
  }
}
