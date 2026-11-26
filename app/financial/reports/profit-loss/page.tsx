"use client";

import { useEffect, useState } from "react";
import { getBusinessDateString, getFinancialYearStartString } from "@/lib/accounting-date";

type Row = { id: string; code: string; name: string; amount: string };
type Report = { from: string; asOf: string; income: Row[]; expenses: Row[]; totals: { income: string; expenses: string; netProfit: string } };

const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProfitLossPage() {
  const [from, setFrom] = useState(getFinancialYearStartString());
  const [asOf, setAsOf] = useState(getBusinessDateString());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, asOf });
      const response = await fetch(`/api/financial/reports/profit-loss?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate Profit & Loss.");
      setReport(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to generate Profit & Loss."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const section = (title: string, rows: Row[], total: string) => <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="font-semibold">{title}</h2>
    <div className="mt-3 divide-y divide-gray-100">{rows.filter((row) => Number(row.amount) !== 0).map((row) => <div key={row.id} className="flex justify-between gap-4 py-2 text-sm"><span>{row.code} · {row.name}</span><span className="tabular-nums">{money(row.amount)}</span></div>)}{!rows.some((row) => Number(row.amount) !== 0) && <p className="py-4 text-sm text-gray-500">No posted balances in this section.</p>}</div>
    <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-sm font-bold"><span>Total {title}</span><span>{money(total)}</span></div>
  </div>;

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Reports</p><h1 className="mt-1 text-2xl font-bold">Profit & Loss</h1><p className="mt-1 text-sm text-gray-600">Income and expense balances from posted journal entries.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">To<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label><button onClick={() => void load()} disabled={loading} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Generating…" : "Generate report"}</button></div></section>
    {report && <><div className="mt-6 grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Total income</p><p className="mt-2 text-xl font-bold">{money(report.totals.income)}</p></article><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Total expenses</p><p className="mt-2 text-xl font-bold">{money(report.totals.expenses)}</p></article><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Net profit / (loss)</p><p className="mt-2 text-xl font-bold">{money(report.totals.netProfit)}</p></article></div><div className="mt-6 grid gap-5 xl:grid-cols-2">{section("Income", report.income, report.totals.income)}{section("Expenses", report.expenses, report.totals.expenses)}</div></>}
  </main>;
}
