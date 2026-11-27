import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { getFinancialUnitAccess } from "@/lib/financial-unit-access";

export async function GET(request: Request) {
  const requestedUnitId = new URL(request.url).searchParams.get("businessUnitId");
  const access = requestedUnitId
    ? await getFinancialUnitAccess(requestedUnitId)
    : await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId");
  const from = params.get("from");
  const to = params.get("to");
  if (!accountId) return NextResponse.json({ error: "Select an account to view its ledger." }, { status: 400 });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value: string) => datePattern.test(value) && !Number.isNaN(new Date(value + "T00:00:00.000Z").getTime()) && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
  if ((from && !validDate(from)) || (to && !validDate(to))) return NextResponse.json({ error: "Dates must be valid dates in YYYY-MM-DD format." }, { status: 400 });
  if (from && to && from > to) return NextResponse.json({ error: "The start date cannot be later than the end date." }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const account = await prisma.account.findFirst({
    where: { id: accountId, businessUnitId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return NextResponse.json({ error: "Account was not found in this business unit." }, { status: 404 });

  const dateFilter = {
    ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
    ...(to ? { lte: new Date(to + "T00:00:00.000Z") } : {}),
  };
  const lines = await prisma.journalLine.findMany({
    where: {
      businessUnitId, accountId,
      journalEntry: {
        businessUnitId, status: "POSTED",
        ...(from || to ? { entryDate: dateFilter } : {}),
      },
    },
    select: {
      id: true, debit: true, credit: true, description: true,
      journalEntry: { select: { id: true, voucherNumber: true, entryDate: true, narration: true } },
    },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { lineNumber: "asc" }],
  });
  let opening = new Prisma.Decimal(0);
  if (from) {
    const prior = await prisma.journalLine.findMany({
      where: {
        businessUnitId, accountId,
        journalEntry: { businessUnitId, status: "POSTED", entryDate: { lt: new Date(from + "T00:00:00.000Z") } },
      },
      select: { debit: true, credit: true },
    });
    opening = prior.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), new Prisma.Decimal(0));
  }
  let running = opening;
  const rows = lines.map((line) => {
    running = running.plus(line.debit).minus(line.credit);
    return {
      id: line.id,
      voucherNumber: line.journalEntry.voucherNumber,
      entryDate: line.journalEntry.entryDate,
      narration: line.journalEntry.narration,
      description: line.description,
      debit: new Prisma.Decimal(line.debit).toFixed(2),
      credit: new Prisma.Decimal(line.credit).toFixed(2),
      runningBalance: running.toFixed(2),
      balanceSide: running.isNegative() ? "CR" : "DR",
    };
  });
  const totalDebit = lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
  const totalCredit = lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
  return NextResponse.json({
    account, from, to, openingBalance: opening.toFixed(2), closingBalance: running.toFixed(2),
    totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2), rows,
  });
}
