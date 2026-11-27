import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getBusinessUnitAccess, getInventorySession, hasGroupPermission } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDateUtc } from "@/lib/accounting-date";

type UnitOption = { id: string; code: string; name: string; profile?: { currency: string } | null };

function money(value: Prisma.Decimal, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value.toNumber());
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">{label}</p><p className="mt-3 text-2xl font-bold text-gray-950">{value}</p><p className="mt-2 text-xs text-gray-500">{detail}</p></article>;
}

function UnitSelector({ units, selected, canViewGroup }: { units: UnitOption[]; selected: string; canViewGroup: boolean }) {
  return <form action="/financial" method="get" className="flex flex-col gap-1">
    <label htmlFor="financial-scope" className="text-xs font-medium text-gray-500">Financial view</label>
    <select id="financial-scope" name="scope" defaultValue={selected} onChange={(event) => {
      const form = event.currentTarget.form;
      if (form) {
        const value = event.currentTarget.value;
        const unitInput = form.querySelector<HTMLInputElement>('input[name="businessUnitId"]');
        if (unitInput) unitInput.disabled = value === "group";
        form.requestSubmit();
      }
    }} className="min-w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
      {canViewGroup && <option value="group">Group Financial</option>}
      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
    </select>
    <input type="hidden" name="businessUnitId" value={selected !== "group" ? selected : ""} disabled={selected === "group"} />
  </form>;
}

export default async function FinancialDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; businessUnitId?: string }>;
}) {
  const params = await searchParams;
  const session = await getInventorySession();
  if (!session) redirect("/login");

  const canViewGroup = await hasGroupPermission(session.user.id, "accounting.read");
  const assignedUnits = canViewGroup
    ? await prisma.businessUnit.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, profile: { select: { currency: true } } },
        orderBy: { name: "asc" },
      })
    : await prisma.userBusinessUnitRole.findMany({
        where: {
          userId: session.user.id,
          businessUnit: { isActive: true },
          role: { isActive: true, scope: "BUSINESS_UNIT", permissions: { some: { permission: { code: "accounting.read" } } } },
          ...(session.user.selectedRoleCode ? { role: { code: session.user.selectedRoleCode, isActive: true, scope: "BUSINESS_UNIT", permissions: { some: { permission: { code: "accounting.read" } } } } } : {}),
        },
        select: { businessUnit: { select: { id: true, code: true, name: true, profile: { select: { currency: true } } } } },
        distinct: ["businessUnitId"],
        orderBy: { businessUnit: { name: "asc" } },
      }).then((rows) => rows.map((row) => row.businessUnit));

  if (!assignedUnits.length) redirect("/access-denied");

  const requestedScope = params.scope === "group" && canViewGroup ? "group" : undefined;
  const requestedUnitId = params.businessUnitId ?? (params.scope && params.scope !== "group" ? params.scope : undefined);
  const activeAccess = await getBusinessUnitAccess("accounting.read");
  const selectedUnit = assignedUnits.find((unit) => unit.id === requestedUnitId)
    ?? assignedUnits.find((unit) => unit.id === activeAccess.context?.businessUnit.id)
    ?? assignedUnits[0];
  const showGroup = requestedScope === "group";
  const now = getBusinessDateUtc();
  const fyStart = new Date(Date.UTC(now.getUTCFullYear() - (now.getUTCMonth() < 3 ? 1 : 0), 3, 1));
  const fyLabel = `FY ${fyStart.getUTCFullYear()}-${String(fyStart.getUTCFullYear() + 1).slice(-2)}`;

  if (showGroup) {
    const units = assignedUnits;
    const unitResults = await Promise.all(units.map(async (unit) => {
      const [periodLines, balanceLines] = await Promise.all([
        prisma.journalLine.findMany({ where: { businessUnitId: unit.id, journalEntry: { status: "POSTED", entryDate: { gte: fyStart, lte: now } } }, select: { debit: true, credit: true, account: { select: { type: true } } } }),
        prisma.journalLine.findMany({ where: { businessUnitId: unit.id, journalEntry: { status: "POSTED", entryDate: { lte: now } } }, select: { debit: true, credit: true, account: { select: { type: true } } } }),
      ]);
      const totals = { income: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), assets: new Prisma.Decimal(0), liabilities: new Prisma.Decimal(0) };
      for (const line of periodLines) {
        const debit = new Prisma.Decimal(line.debit), credit = new Prisma.Decimal(line.credit);
        if (line.account.type === "INCOME") totals.income = totals.income.plus(credit.minus(debit));
        if (line.account.type === "EXPENSE") totals.expenses = totals.expenses.plus(debit.minus(credit));
      }
      for (const line of balanceLines) {
        const debit = new Prisma.Decimal(line.debit), credit = new Prisma.Decimal(line.credit);
        if (line.account.type === "ASSET") totals.assets = totals.assets.plus(debit.minus(credit));
        if (line.account.type === "LIABILITY") totals.liabilities = totals.liabilities.plus(credit.minus(debit));
      }
      return { ...unit, currency: unit.profile?.currency ?? "INR", hasLedger: periodLines.length > 0 || balanceLines.length > 0, ...totals, netResult: totals.income.minus(totals.expenses) };
    }));
    const byCurrency = new Map<string, { income: Prisma.Decimal; expenses: Prisma.Decimal; netResult: Prisma.Decimal }>();
    for (const unit of unitResults) {
      const current = byCurrency.get(unit.currency) ?? { income: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), netResult: new Prisma.Decimal(0) };
      byCurrency.set(unit.currency, { income: current.income.plus(unit.income), expenses: current.expenses.plus(unit.expenses), netResult: current.netResult.plus(unit.netResult) });
    }
    return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p><h1 className="mt-1 text-2xl font-bold">Financial Dashboard</h1><p className="mt-1 text-sm text-gray-600">Consolidated posted-ledger view · {fyLabel}. Totals remain separated by currency.</p></div>
        <UnitSelector units={units} selected="group" canViewGroup={canViewGroup} />
      </header>
      <section className="mt-8"><h2 className="text-lg font-semibold">Consolidated totals by currency</h2>
        {byCurrency.size ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[...byCurrency.entries()].map(([currency, totals]) => <article key={currency} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-gray-500">{currency}</p><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-gray-600">Revenue</dt><dd className="font-semibold">{money(totals.income, currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-600">Expenses</dt><dd className="font-semibold">{money(totals.expenses, currency)}</dd></div><div className="flex justify-between gap-3 border-t border-gray-100 pt-3"><dt className="font-medium">Net result</dt><dd className="font-bold">{money(totals.netResult, currency)}</dd></div></dl></article>)}</div> : <p className="mt-4 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">No active business units are configured.</p>}
      </section>
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Business-unit financial position</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-4">Business unit</th><th className="py-2 pr-4">Currency</th><th className="py-2 pr-4">Revenue</th><th className="py-2 pr-4">Expenses</th><th className="py-2 pr-4">Net result</th><th className="py-2">Ledger</th></tr></thead><tbody>{unitResults.map((unit) => <tr key={unit.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-4 font-medium">{unit.name}</td><td className="py-3 pr-4">{unit.currency}</td><td className="py-3 pr-4">{money(unit.income, unit.currency)}</td><td className="py-3 pr-4">{money(unit.expenses, unit.currency)}</td><td className="py-3 pr-4 font-semibold">{money(unit.netResult, unit.currency)}</td><td className="py-3">{unit.hasLedger ? <span className="text-emerald-700">Entries posted</span> : <span className="text-gray-500">No entries</span>}</td></tr>)}</tbody></table></div></section>
    </main>;
  }

  const unit = await prisma.businessUnit.findFirst({
    where: { id: selectedUnit.id, isActive: true },
    select: { name: true, profile: { select: { currency: true } } },
  });
  if (!unit) redirect("/access-denied");
  const [entries, periodLines, balanceLines] = await Promise.all([
    prisma.journalEntry.findMany({ where: { businessUnitId: selectedUnit.id, status: "POSTED", entryDate: { gte: fyStart, lte: now } }, select: { voucherNumber: true, entryDate: true, lines: { select: { debit: true } } }, orderBy: { entryDate: "desc" }, take: 8 }),
    prisma.journalLine.findMany({ where: { businessUnitId: selectedUnit.id, journalEntry: { status: "POSTED", entryDate: { gte: fyStart, lte: now } } }, select: { debit: true, credit: true, account: { select: { code: true, type: true } } } }),
    prisma.journalLine.findMany({ where: { businessUnitId: selectedUnit.id, journalEntry: { status: "POSTED", entryDate: { lte: now } } }, select: { debit: true, credit: true, account: { select: { code: true, type: true } } } }),
  ]);
  const zero = () => new Prisma.Decimal(0);
  const totals = { income: zero(), expenses: zero(), cashBank: zero(), receivables: zero(), payables: zero(), assets: zero(), liabilities: zero(), equity: zero() };
  for (const line of periodLines) {
    const debit = new Prisma.Decimal(line.debit), credit = new Prisma.Decimal(line.credit);
    if (line.account.type === "INCOME") totals.income = totals.income.plus(credit.minus(debit));
    if (line.account.type === "EXPENSE") totals.expenses = totals.expenses.plus(debit.minus(credit));
  }
  for (const line of balanceLines) {
    const debit = new Prisma.Decimal(line.debit), credit = new Prisma.Decimal(line.credit), debitBalance = debit.minus(credit), creditBalance = credit.minus(debit);
    if (line.account.type === "ASSET") totals.assets = totals.assets.plus(debitBalance);
    if (line.account.type === "LIABILITY") totals.liabilities = totals.liabilities.plus(creditBalance);
    if (line.account.type === "EQUITY") totals.equity = totals.equity.plus(creditBalance);
    if (["1000", "1010", "1020"].includes(line.account.code)) totals.cashBank = totals.cashBank.plus(debitBalance);
    if (line.account.code === "1100") totals.receivables = totals.receivables.plus(debitBalance);
    if (line.account.code === "2000") totals.payables = totals.payables.plus(creditBalance);
  }
  const currency = unit.profile?.currency ?? "INR";
  const netResult = totals.income.minus(totals.expenses);
  const hasLedger = periodLines.length > 0 || balanceLines.length > 0;
  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6"><div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p><h1 className="mt-1 text-2xl font-bold">Financial Dashboard</h1><p className="mt-1 text-sm text-gray-600">{unit.name} · Ledger-based financial position · {fyLabel} · {currency}</p></div><UnitSelector units={assignedUnits} selected={selectedUnit.id} canViewGroup={canViewGroup} /></header>
    {!hasLedger && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Accounting ledger is ready for setup.</p><p className="mt-1">No posted journal entries exist for this financial year yet. Figures will appear here only after transactions are posted to the General Ledger.</p></div>}
    <section className="mt-8"><h2 className="text-lg font-semibold">Financial performance</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenue" value={money(totals.income, currency)} detail="Posted income accounts, FY to date" /><Metric label="Expenses" value={money(totals.expenses, currency)} detail="Posted expense accounts, FY to date" /><Metric label="Net result" value={money(netResult, currency)} detail="Revenue less expenses; ledger basis" /><Metric label="Cash & bank" value={money(totals.cashBank, currency)} detail="Cash and bank control accounts" /></div></section>
    <section className="mt-8"><h2 className="text-lg font-semibold">Financial position</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total assets" value={money(totals.assets, currency)} detail="Debit-normal asset balances" /><Metric label="Receivables" value={money(totals.receivables, currency)} detail="Customer control account" /><Metric label="Payables" value={money(totals.payables, currency)} detail="Supplier control account" /><Metric label="Liabilities" value={money(totals.liabilities, currency)} detail="Credit-normal liability balances" /></div></section>
    <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Recent posted vouchers</h2>{entries.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-4">Voucher</th><th className="py-2 pr-4">Date</th><th className="py-2">Debit total</th></tr></thead><tbody>{entries.map((entry) => { const debit = entry.lines.reduce((sum, line) => sum.plus(line.debit), zero()); return <tr key={entry.voucherNumber} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-4 font-medium">{entry.voucherNumber}</td><td className="py-3 pr-4 text-gray-600">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(entry.entryDate)}</td><td className="py-3">{money(debit, currency)}</td></tr>; })}</tbody></table></div> : <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No posted vouchers to display.</p>}</div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Accounting workspace</h2><p className="mt-1 text-sm text-gray-600">Use Chart of Accounts and Journal Vouchers to maintain the ledger. General Ledger and Trial Balance are available under Financial Reports.</p><ul className="mt-4 space-y-2 text-sm text-gray-700"><li>• Chart of Accounts</li><li>• General Ledger and account ledger</li><li>• Journal vouchers and reversals</li><li>• Trial Balance</li><li>• Profit & Loss and Balance Sheet</li><li>• Cash and Bank books</li></ul><Link href="/financial/accounts" className="mt-4 inline-block text-sm font-semibold text-emerald-900 hover:underline">Open chart of accounts</Link></div></section>
  </main>;
}
