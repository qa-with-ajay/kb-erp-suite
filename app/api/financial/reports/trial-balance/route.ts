import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const rawDate = params.get("asOf") || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(new Date(rawDate + "T00:00:00.000Z").getTime())) {
    return NextResponse.json({ error: "Provide a valid as-of date in YYYY-MM-DD format." }, { status: 400 });
  }
  const asOf = new Date(rawDate + "T00:00:00.000Z");
  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({
      where: { businessUnitId: access.context.businessUnit.id },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.journalLine.findMany({
      where: {
        businessUnitId: access.context.businessUnit.id,
        journalEntry: { businessUnitId: access.context.businessUnit.id, status: "POSTED", entryDate: { lte: asOf } },
      },
      select: { accountId: true, debit: true, credit: true },
    }),
  ]);
  const balances = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of lines) {
    const current = balances.get(line.accountId) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    balances.set(line.accountId, {
      debit: current.debit.plus(line.debit),
      credit: current.credit.plus(line.credit),
    });
  }
  const rows = accounts.map((account) => {
    const totals = balances.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    const net = totals.debit.minus(totals.credit);
    return {
      ...account,
      totalDebit: totals.debit.toFixed(2),
      totalCredit: totals.credit.toFixed(2),
      debitBalance: net.greaterThan(0) ? net.toFixed(2) : "0.00",
      creditBalance: net.lessThan(0) ? net.abs().toFixed(2) : "0.00",
    };
  });
  const totalDebit = rows.reduce((sum, row) => sum.plus(row.debitBalance), new Prisma.Decimal(0));
  const totalCredit = rows.reduce((sum, row) => sum.plus(row.creditBalance), new Prisma.Decimal(0));
  return NextResponse.json({
    asOf: rawDate, rows,
    totals: { debit: totalDebit.toFixed(2), credit: totalCredit.toFixed(2), isBalanced: totalDebit.equals(totalCredit) },
  });
}
