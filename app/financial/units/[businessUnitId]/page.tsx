import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getFinancialUnitAccess } from "@/lib/financial-unit-access";
import { prisma } from "@/lib/prisma";
import { getBusinessDateUtc } from "@/lib/accounting-date";

function money(value: Prisma.Decimal, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value.toNumber());
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <p className="text-sm text-gray-500">{label}</p><p className="mt-3 text-2xl font-bold text-gray-950">{value}</p><p className="mt-2 text-xs text-gray-500">{detail}</p>
  </article>;
}

export default async function BusinessUnitFinancialDashboard({ params }: { params: Promise<{ businessUnitId: string }> }) {
  const { businessUnitId } = await params;
  const access = await getFinancialUnitAccess(businessUnitId);
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    if (access.status === 404) notFound();
    redirect("/access-denied");
  }
  const unit = access.context.businessUnit;
  const now = getBusinessDateUtc();
  const financialYearStart = new Date(Date.UTC(now.getUTCFullYear() - (now.getUTCMonth() < 3 ? 1 : 0), 3, 1));
  const [periodLines, balanceLines, entries] = await Promise.all([
    prisma.journalLine.findMany({
      where: { businessUnitId: unit.id, journalEntry: { businessUnitId: unit.id, status: "POSTED", entryDate: { gte: financialYearStart, lte: now } } },
      select: { debit: true, credit: true, account: { select: { type: true } } },
    }),
    prisma.journalLine.findMany({
      where: { businessUnitId: unit.id, journalEntry: { businessUnitId: unit.id, status: "POSTED", entryDate: { lte: now } } },
      select: { debit: true, credit: true, account: { select: { code: true, type: true } } },
    }),
    prisma.journalEntry.findMany({
      where: { businessUnitId: unit.id, status: "POSTED", entryDate: { gte: financialYearStart, lte: now } },
      select: { id: true, voucherNumber: true, entryDate: true, lines: { select: { debit: true } } },
      orderBy: { entryDate: "desc" }, take: 8,
    }),
  ]);
  const totals = { income: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), assets: new Prisma.Decimal(0), liabilities: new Prisma.Decimal(0), cashBank: new Prisma.Decimal(0) };
  for (const line of periodLines) {
    if (line.account.type === "INCOME") totals.income = totals.income.plus(line.credit).minus(line.debit);
    if (line.account.type === "EXPENSE") totals.expenses = totals.expenses.plus(line.debit).minus(line.credit);
  }
  for (const line of balanceLines) {
    if (line.account.type === "ASSET") totals.assets = totals.assets.plus(line.debit).minus(line.credit);
    if (line.account.type === "LIABILITY") totals.liabilities = totals.liabilities.plus(line.credit).minus(line.debit);
    if (["1000", "1010", "1020"].includes(line.account.code)) totals.cashBank = totals.cashBank.plus(line.debit).minus(line.credit);
  }
  const currency = unit.profile?.currency ?? "INR";
  const fyLabel = `FY ${financialYearStart.getUTCFullYear()}-${String(financialYearStart.getUTCFullYear() + 1).slice(-2)}`;
  const reportQuery = `?businessUnitId=${unit.id}`;
  const reports = [
    ["General Ledger", "/financial/reports/general-ledger"],
    ["Trial Balance", "/financial/reports/trial-balance"],
    ["Profit & Loss", "/financial/reports/profit-loss"],
    ["Balance Sheet", "/financial/reports/balance-sheet"],
  ] as const;

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management · Business Unit</p><h1 className="mt-1 text-2xl font-bold">{unit.name} Financial Dashboard</h1><p className="mt-1 text-sm text-gray-600">Unit-scoped posted-ledger overview · {fyLabel} · {currency}</p></div>
      <Link href="/financial/group" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">Group dashboard</Link>
    </header>
    {periodLines.length === 0 && balanceLines.length === 0 && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">No posted accounting entries found.</p><p className="mt-1">Figures will appear after transactions are posted to this unit's General Ledger.</p></div>}
    <section className="mt-8"><h2 className="text-lg font-semibold">Financial performance</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Revenue" value={money(totals.income, currency)} detail="Posted income accounts · FY to date" />
      <Metric label="Expenses" value={money(totals.expenses, currency)} detail="Posted expense accounts · FY to date" />
      <Metric label="Net result" value={money(totals.income.minus(totals.expenses), currency)} detail="Revenue less expenses" />
      <Metric label="Cash & bank" value={money(totals.cashBank, currency)} detail="Cash and bank control accounts" />
    </div></section>
    <section className="mt-8"><h2 className="text-lg font-semibold">Financial position</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Total assets" value={money(totals.assets, currency)} detail="Debit-normal asset balances" />
      <Metric label="Liabilities" value={money(totals.liabilities, currency)} detail="Credit-normal liability balances" />
      <Metric label="Posted vouchers" value={String(entries.length)} detail="Recent vouchers shown below (maximum 8)" />
    </div></section>
    <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Recent posted vouchers</h2>{entries.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-4">Voucher</th><th className="py-2 pr-4">Date</th><th className="py-2">Debit</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-4 font-medium">{entry.voucherNumber}</td><td className="py-3 pr-4 text-gray-600">{new Intl.DateTimeFormat("en-IN",{dateStyle:"medium"}).format(entry.entryDate)}</td><td className="py-3">{money(entry.lines.reduce((sum,line)=>sum.plus(line.debit),new Prisma.Decimal(0)),currency)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-gray-500">No posted vouchers to display.</p>}</div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Unit financial reports</h2><p className="mt-1 text-sm text-gray-600">Each report is restricted to this business unit.</p><nav className="mt-4 space-y-2">{reports.map(([label,href])=><Link key={href} href={href+reportQuery} className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">{label} <span aria-hidden="true">→</span></Link>)}</nav></div>
    </section>
  </main>;
}
