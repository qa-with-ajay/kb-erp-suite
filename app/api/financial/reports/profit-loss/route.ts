import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { getBusinessDateString } from "@/lib/accounting-date";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const asOf = params.get("asOf") || getBusinessDateString();
  const from = params.get("from") || `${getBusinessDateString().slice(0, 4)}-04-01`;
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime()) && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
  if (!validDate(from) || !validDate(asOf) || from > asOf) return NextResponse.json({ error: "Provide a valid report date range." }, { status: 400 });

  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({
      where: { businessUnitId: access.context.businessUnit.id, type: { in: ["INCOME", "EXPENSE"] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.journalLine.findMany({
      where: {
        businessUnitId: access.context.businessUnit.id,
        journalEntry: { businessUnitId: access.context.businessUnit.id, status: "POSTED", entryDate: { gte: new Date(from + "T00:00:00.000Z"), lte: new Date(asOf + "T00:00:00.000Z") } },
      },
      select: { accountId: true, debit: true, credit: true },
    }),
  ]);
  const balances = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of lines) {
    const current = balances.get(line.accountId) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    balances.set(line.accountId, { debit: current.debit.plus(line.debit), credit: current.credit.plus(line.credit) });
  }
  const incomeRows = [];
  const expenseRows = [];
  for (const account of accounts) {
    const totals = balances.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    const amount = account.type === "INCOME" ? totals.credit.minus(totals.debit) : totals.debit.minus(totals.credit);
    const row = { ...account, amount: amount.toFixed(2) };
    if (account.type === "INCOME") incomeRows.push(row);
    else expenseRows.push(row);
  }
  const totalIncome = incomeRows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const totalExpenses = expenseRows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  return NextResponse.json({
    from, asOf, income: incomeRows, expenses: expenseRows,
    totals: { income: totalIncome.toFixed(2), expenses: totalExpenses.toFixed(2), netProfit: totalIncome.minus(totalExpenses).toFixed(2) },
  });
}
