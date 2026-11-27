import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { expenseInputSchema } from "@/lib/finance-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("expenses.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const validDate = (value: string | null) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime()));
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return NextResponse.json({ error: "Invalid expense date range." }, { status: 400 });
  const manageAccess = await getBusinessUnitAccess("expenses.manage");
  const [records, paymentAccounts] = await Promise.all([prisma.expense.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      ...(from || to ? { expenseDate: { ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}), ...(to ? { lte: new Date(to + "T00:00:00.000Z") } : {}) } } : {}),
    },
    include: {
      category: { select: { id: true, name: true, expenseAccount: { select: { code: true, name: true } } } },
      paymentAccount: { select: { id: true, name: true, type: true } },
      journalEntry: { select: { voucherNumber: true, status: true } },
      creator: { select: { name: true } },
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    take: 250,
  }), prisma.paymentAccount.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    select: { id: true, name: true, type: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })]);
  return NextResponse.json({ expenses: records, paymentAccounts, canManage: manageAccess.ok });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("expenses.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = expenseInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid expense details.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const actorId = access.context.session.user.id;
  const input = parsed.data;
  const amount = new Prisma.Decimal(input.amount);
  const expenseDate = new Date(input.expenseDate + "T00:00:00.000Z");
  try {
    const expense = await prisma.$transaction(async (tx) => {
      const [category, paymentAccount, period] = await Promise.all([
        tx.expenseCategory.findFirst({ where: { id: input.categoryId, businessUnitId, isActive: true }, include: { expenseAccount: { select: { id: true, code: true } } } }),
        tx.paymentAccount.findFirst({ where: { id: input.paymentAccountId, businessUnitId, isActive: true }, include: { ledgerAccount: { select: { id: true, code: true } } } }),
        tx.accountingPeriod.findFirst({ where: { businessUnitId, status: "OPEN", startDate: { lte: expenseDate }, endDate: { gte: expenseDate } }, select: { id: true } }),
      ]);
      if (!category) throw new Error("EXPENSE_CATEGORY_NOT_FOUND");
      if (!paymentAccount) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
      if (!period) throw new Error("OPEN_ACCOUNTING_PERIOD_NOT_FOUND");

      const id = randomUUID();
      const expenseNumber = `EXP-${input.expenseDate.replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
      const voucherNumber = expenseNumber;
      const journal = await tx.journalEntry.create({
        data: {
          id: randomUUID(), businessUnitId, periodId: period.id, voucherNumber,
          entryDate: expenseDate, narration: input.description, sourceType: "EXPENSE", sourceId: id,
          idempotencyKey: `expense:${id}`, createdBy: actorId,
          lines: { create: [
            { accountId: category.expenseAccount.id, lineNumber: 1, description: input.description, debit: amount, credit: new Prisma.Decimal(0) },
            { accountId: paymentAccount.ledgerAccount.id, lineNumber: 2, description: input.description, debit: new Prisma.Decimal(0), credit: amount },
          ] },
        },
        select: { id: true, voucherNumber: true },
      });
      await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedBy: actorId, postedAt: new Date() } });
      const cashBankId = randomUUID();
      await tx.cashBankTransaction.create({
        data: {
          id: cashBankId, businessUnitId,
          transactionNumber: `CB-${expenseNumber}`,
          type: "PAYMENT", paymentAccountId: paymentAccount.id,
          offsetAccountId: category.expenseAccount.id,
          amount, transactionDate: expenseDate,
          reference: input.reference || null, narration: input.description,
          journalEntryId: journal.id, createdBy: actorId,
        },
      });
      const created = await tx.expense.create({
        data: {
          id, businessUnitId, expenseNumber, categoryId: category.id, paymentAccountId: paymentAccount.id,
          expenseDate, amount, description: input.description, reference: input.reference || null,
          journalEntryId: journal.id, createdBy: actorId,
        },
        include: {
          category: { select: { id: true, name: true, expenseAccount: { select: { code: true, name: true } } } },
          paymentAccount: { select: { id: true, name: true, type: true } },
          journalEntry: { select: { voucherNumber: true, status: true } },
          creator: { select: { name: true } },
        },
      });
      await tx.auditLog.create({ data: {
        userId: actorId, businessUnitId, action: "CREATE", entity: "Expense", entityId: created.id,
        details: { expenseNumber, amount: amount.toFixed(2), category: category.name, paymentAccount: paymentAccount.name },
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = {
      EXPENSE_CATEGORY_NOT_FOUND: "The selected expense category is inactive or unavailable.",
      PAYMENT_ACCOUNT_NOT_FOUND: "The selected cash/bank account is inactive or unavailable.",
      OPEN_ACCOUNTING_PERIOD_NOT_FOUND: "No open accounting period covers this expense date.",
    };
    if (error instanceof Error && messages[error.message]) return NextResponse.json({ error: messages[error.message] }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "A concurrent financial update occurred. Refresh and retry." }, { status: 409 });
    throw error;
  }
}
