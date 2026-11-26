import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDateUtc } from "@/lib/accounting-date";

function money(value: Prisma.Decimal, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value.toNumber());
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-gray-950">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </article>
  );
}

export default async function FinancialDashboardPage() {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/access-denied");

  const unit = await prisma.businessUnit.findUnique({
    where: { id: access.context.businessUnit.id },
    select: { name: true, profile: { select: { currency: true } } },
  });
  if (!unit) redirect("/access-denied");

  const now = getBusinessDateUtc();
  const financialYearStart = new Date(Date.UTC(now.getUTCFullYear() - (now.getUTCMonth() < 3 ? 1 : 0), 3, 1));
  const entries = await prisma.journalEntry.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      status: "POSTED",
      entryDate: { gte: financialYearStart, lte: now },
    },
    select: {
      voucherNumber: true,
      entryDate: true,
      lines: {
        select: {
          debit: true,
          credit: true,
          account: { select: { code: true, name: true, type: true } },
        },
      },
    },
    orderBy: { entryDate: "desc" },
    take: 8,
  });

  // Fetch all posted lines in the selected period for correct totals; the recent-voucher list is capped above.
  const periodLines = await prisma.journalLine.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      journalEntry: { status: "POSTED", entryDate: { gte: financialYearStart, lte: now } },
    },
    select: { debit: true, credit: true, account: { select: { code: true, type: true } } },
  });

  const balanceLines = await prisma.journalLine.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      journalEntry: { status: "POSTED", entryDate: { lte: now } },
    },
    select: { debit: true, credit: true, account: { select: { code: true, type: true } } },
  });

  const zero = () => new Prisma.Decimal(0);
  const totals = {
    income: zero(), expenses: zero(), cashBank: zero(), receivables: zero(), payables: zero(),
    assets: zero(), liabilities: zero(), equity: zero(),
  };
  for (const line of periodLines) {
    const debit = new Prisma.Decimal(line.debit);
    const credit = new Prisma.Decimal(line.credit);
    const debitBalance = debit.minus(credit);
    const creditBalance = credit.minus(debit);
    if (line.account.type === "INCOME") totals.income = totals.income.plus(creditBalance);
    if (line.account.type === "EXPENSE") totals.expenses = totals.expenses.plus(debitBalance);

  }
  for (const line of balanceLines) {
    const debit = new Prisma.Decimal(line.debit);
    const credit = new Prisma.Decimal(line.credit);
    const debitBalance = debit.minus(credit);
    const creditBalance = credit.minus(debit);
    if (line.account.type === "ASSET") totals.assets = totals.assets.plus(debitBalance);
    if (line.account.type === "LIABILITY") totals.liabilities = totals.liabilities.plus(creditBalance);
    if (line.account.type === "EQUITY") totals.equity = totals.equity.plus(creditBalance);
    if (line.account.code === "1000" || line.account.code === "1010") totals.cashBank = totals.cashBank.plus(debitBalance);
    if (line.account.code === "1100") totals.receivables = totals.receivables.plus(debitBalance);
    if (line.account.code === "2000") totals.payables = totals.payables.plus(creditBalance);
  }
  const currency = unit.profile?.currency ?? "INR";
  const netResult = totals.income.minus(totals.expenses);
  const hasLedger = periodLines.length > 0 || balanceLines.length > 0;
  const fyLabel = `FY ${financialYearStart.getUTCFullYear()}-${String(financialYearStart.getUTCFullYear() + 1).slice(-2)}`;

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p>
          <h1 className="mt-1 text-2xl font-bold">{unit.name} Financial Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Ledger-based financial position · {fyLabel} · {currency}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">Business unit view</div>
      </header>

      {!hasLedger && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Accounting ledger is ready for setup.</p>
          <p className="mt-1">No posted journal entries exist for this financial year yet. Figures will appear here only after transactions are posted to the General Ledger.</p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Financial performance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Revenue" value={money(totals.income, currency)} detail="Posted income accounts, FY to date" />
          <Metric label="Expenses" value={money(totals.expenses, currency)} detail="Posted expense accounts, FY to date" />
          <Metric label="Net result" value={money(netResult, currency)} detail="Revenue less expenses; ledger basis" />
          <Metric label="Cash & bank" value={money(totals.cashBank, currency)} detail="Cash and bank control accounts" />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Financial position</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total assets" value={money(totals.assets, currency)} detail="Debit-normal asset balances" />
          <Metric label="Receivables" value={money(totals.receivables, currency)} detail="Customer control account" />
          <Metric label="Payables" value={money(totals.payables, currency)} detail="Supplier control account" />
          <Metric label="Liabilities" value={money(totals.liabilities, currency)} detail="Credit-normal liability balances" />
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Recent posted vouchers</h2>
          {entries.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr><th className="py-2 pr-4">Voucher</th><th className="py-2 pr-4">Date</th><th className="py-2">Debit total</th></tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const debit = entry.lines.reduce((sum, line) => sum.plus(line.debit), zero());
                    return <tr key={entry.voucherNumber} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium">{entry.voucherNumber}</td>
                      <td className="py-3 pr-4 text-gray-600">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(entry.entryDate)}</td>
                      <td className="py-3">{money(debit, currency)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No posted vouchers to display.</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Accounting workspace</h2>
          <p className="mt-1 text-sm text-gray-600">Use Chart of Accounts and Journal Vouchers to maintain the ledger. General Ledger and Trial Balance are available under Financial Reports.</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            <li>• Chart of Accounts</li>
            <li>• General Ledger and account ledger</li>
            <li>• Journal vouchers and reversals</li>
            <li>• Trial Balance</li>
            <li>• Profit & Loss and Balance Sheet</li>
            <li>• Cash and Bank books</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
