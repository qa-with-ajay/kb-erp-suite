import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { getFinancialUnitAccess } from "@/lib/financial-unit-access";
import { getBusinessDateString } from "@/lib/accounting-date";

export async function GET(request: Request) {
  const requestedUnitId = new URL(request.url).searchParams.get("businessUnitId");
  const access = requestedUnitId
    ? await getFinancialUnitAccess(requestedUnitId)
    : await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const asOf = params.get("asOf") || getBusinessDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(new Date(asOf + "T00:00:00.000Z").getTime()) || new Date(asOf + "T00:00:00.000Z").toISOString().slice(0, 10) !== asOf) {
    return NextResponse.json({ error: "Provide a valid as-of date in YYYY-MM-DD format." }, { status: 400 });
  }
  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({
      where: { businessUnitId: access.context.businessUnit.id },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.journalLine.findMany({
      where: {
        businessUnitId: access.context.businessUnit.id,
        journalEntry: { businessUnitId: access.context.businessUnit.id, status: "POSTED", entryDate: { lte: new Date(asOf + "T00:00:00.000Z") } },
      },
      select: { accountId: true, debit: true, credit: true },
    }),
  ]);
  const balances = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of lines) {
    const current = balances.get(line.accountId) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    balances.set(line.accountId, { debit: current.debit.plus(line.debit), credit: current.credit.plus(line.credit) });
  }
  const sections = { assets: [] as Array<{ id: string; code: string; name: string; amount: string }>, liabilities: [] as Array<{ id: string; code: string; name: string; amount: string }>, equity: [] as Array<{ id: string; code: string; name: string; amount: string }> };
  let totalAssets = new Prisma.Decimal(0);
  let totalLiabilities = new Prisma.Decimal(0);
  let totalEquity = new Prisma.Decimal(0);
  let unclosedIncome = new Prisma.Decimal(0);
  let unclosedExpenses = new Prisma.Decimal(0);

  for (const account of accounts) {
    const totals = balances.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    const debitBalance = totals.debit.minus(totals.credit);
    const creditBalance = totals.credit.minus(totals.debit);
    if (account.type === "ASSET") {
      const amount = debitBalance;
      totalAssets = totalAssets.plus(amount);
      if (!amount.isZero()) sections.assets.push({ id: account.id, code: account.code, name: account.name, amount: amount.toFixed(2) });
    } else if (account.type === "LIABILITY") {
      const amount = creditBalance;
      totalLiabilities = totalLiabilities.plus(amount);
      if (!amount.isZero()) sections.liabilities.push({ id: account.id, code: account.code, name: account.name, amount: amount.toFixed(2) });
    } else if (account.type === "EQUITY") {
      const amount = creditBalance;
      totalEquity = totalEquity.plus(amount);
      if (!amount.isZero()) sections.equity.push({ id: account.id, code: account.code, name: account.name, amount: amount.toFixed(2) });
    } else if (account.type === "INCOME") {
      unclosedIncome = unclosedIncome.plus(creditBalance);
    } else if (account.type === "EXPENSE") {
      unclosedExpenses = unclosedExpenses.plus(debitBalance);
    }
  }
  const unclosedEarnings = unclosedIncome.minus(unclosedExpenses);
  const totalEquityAndEarnings = totalEquity.plus(unclosedEarnings);
  const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquityAndEarnings);
  return NextResponse.json({
    asOf,
    assets: sections.assets,
    liabilities: sections.liabilities,
    equity: sections.equity,
    unclosedEarnings: unclosedEarnings.toFixed(2),
    totals: {
      assets: totalAssets.toFixed(2),
      liabilities: totalLiabilities.toFixed(2),
      equity: totalEquity.toFixed(2),
      liabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
      isBalanced: totalAssets.equals(totalLiabilitiesAndEquity),
    },
    note: "Unclosed earnings are calculated from posted income and expense balances. They are not a posted retained-earnings journal until a year-end closing workflow is completed.",
  });
}
