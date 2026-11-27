import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getInventorySession, hasGroupPermission } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDateUtc } from "@/lib/accounting-date";

function money(value: Prisma.Decimal, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value.toNumber());
}

export default async function GroupFinancialDashboardPage() {
  const session = await getInventorySession();
  if (!session) redirect("/login");
  if (!(await hasGroupPermission(session.user.id, "accounting.read"))) redirect("/access-denied");

  const now = getBusinessDateUtc();
  const fyStart = new Date(Date.UTC(now.getUTCFullYear() - (now.getUTCMonth() < 3 ? 1 : 0), 3, 1));
  const units = await prisma.businessUnit.findMany({
    where: { isActive: true },
    select: {
      id: true, code: true, name: true,
      profile: { select: { currency: true } },
    },
    orderBy: { name: "asc" },
  });

  const unitResults = await Promise.all(units.map(async (unit) => {
    const [periodLines, balanceLines] = await Promise.all([
      prisma.journalLine.findMany({
        where: {
          businessUnitId: unit.id,
          journalEntry: { status: "POSTED", entryDate: { gte: fyStart, lte: now } },
        },
        select: { debit: true, credit: true, account: { select: { type: true } } },
      }),
      prisma.journalLine.findMany({
        where: {
          businessUnitId: unit.id,
          journalEntry: { status: "POSTED", entryDate: { lte: now } },
        },
        select: { debit: true, credit: true, account: { select: { type: true } } },
      }),
    ]);
    const totals = { income: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), assets: new Prisma.Decimal(0), liabilities: new Prisma.Decimal(0) };
    for (const line of periodLines) {
      const debit = new Prisma.Decimal(line.debit);
      const credit = new Prisma.Decimal(line.credit);
      if (line.account.type === "INCOME") totals.income = totals.income.plus(credit.minus(debit));
      if (line.account.type === "EXPENSE") totals.expenses = totals.expenses.plus(debit.minus(credit));
    }
    for (const line of balanceLines) {
      const debit = new Prisma.Decimal(line.debit);
      const credit = new Prisma.Decimal(line.credit);
      if (line.account.type === "ASSET") totals.assets = totals.assets.plus(debit.minus(credit));
      if (line.account.type === "LIABILITY") totals.liabilities = totals.liabilities.plus(credit.minus(debit));
    }
    return { ...unit, currency: unit.profile?.currency ?? "INR", hasLedger: periodLines.length > 0 || balanceLines.length > 0, ...totals, netResult: totals.income.minus(totals.expenses) };
  }));

  const byCurrency = new Map<string, { income: Prisma.Decimal; expenses: Prisma.Decimal; netResult: Prisma.Decimal }>();
  for (const unit of unitResults) {
    const current = byCurrency.get(unit.currency) ?? { income: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), netResult: new Prisma.Decimal(0) };
    byCurrency.set(unit.currency, {
      income: current.income.plus(unit.income),
      expenses: current.expenses.plus(unit.expenses),
      netResult: current.netResult.plus(unit.netResult),
    });
  }
  const fyLabel = `FY ${fyStart.getUTCFullYear()}-${String(fyStart.getUTCFullYear() + 1).slice(-2)}`;
  const hasAnyLedger = unitResults.some((unit) => unit.hasLedger);

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p>
        <h1 className="mt-1 text-2xl font-bold">Group Financial Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Consolidated posted-ledger view · {fyLabel}. Totals remain separated by currency.</p>
      </header>

      {!hasAnyLedger && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">No posted accounting entries found.</p>
        <p className="mt-1">Group financial totals will populate after the journal posting workflows are enabled and source transactions are posted.</p>
      </div>}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Consolidated totals by currency</h2>
        {byCurrency.size ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...byCurrency.entries()].map(([currency, totals]) => <article key={currency} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-500">{currency}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-600">Revenue</dt><dd className="font-semibold">{money(totals.income, currency)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-600">Expenses</dt><dd className="font-semibold">{money(totals.expenses, currency)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-gray-100 pt-3"><dt className="font-medium">Net result</dt><dd className="font-bold">{money(totals.netResult, currency)}</dd></div>
            </dl>
          </article>)}
        </div> : <p className="mt-4 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">No active business units are configured.</p>}
      </section>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Business-unit financial position</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr><th className="py-2 pr-4">Business unit</th><th className="py-2 pr-4">Currency</th><th className="py-2 pr-4">Revenue</th><th className="py-2 pr-4">Expenses</th><th className="py-2 pr-4">Net result</th><th className="py-2 pr-4">Ledger</th><th className="py-2">Dashboard</th></tr>
            </thead>
            <tbody>
              {unitResults.map((unit) => <tr key={unit.id} className="border-b border-gray-100 last:border-0">
                <td className="py-3 pr-4 font-medium">{unit.name}</td>
                <td className="py-3 pr-4">{unit.currency}</td>
                <td className="py-3 pr-4">{money(unit.income, unit.currency)}</td>
                <td className="py-3 pr-4">{money(unit.expenses, unit.currency)}</td>
                <td className="py-3 pr-4 font-semibold">{money(unit.netResult, unit.currency)}</td>
                <td className="py-3 pr-4">{unit.hasLedger ? <span className="text-emerald-700">Entries posted</span> : <span className="text-gray-500">No entries</span>}</td><td className="py-3"><a className="font-medium text-emerald-800 hover:underline" href={`/financial/units/${unit.id}`}>Open dashboard →</a></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
