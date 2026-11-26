"use client";

import { useEffect, useState } from "react";
import { getBusinessDateString } from "@/lib/accounting-date";

type Row = { id: string; code: string; name: string; amount: string };
type Report = {
  asOf: string; assets: Row[]; liabilities: Row[]; equity: Row[]; unclosedEarnings: string;
  totals: { assets: string; liabilities: string; equity: string; liabilitiesAndEquity: string; isBalanced: boolean };
  note: string;
};
const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(getBusinessDateString());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/financial/reports/balance-sheet?asOf=${asOf}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate Balance Sheet.");
      setReport(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to generate Balance Sheet."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const section = (title: string, rows: Row[], total: string) => <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="font-semibold">{title}</h2>
    <div className="mt-3 divide-y divide-gray-100">{rows.map((row) => <div key={row.id} className="flex justify-between gap-4 py-2 text-sm"><span>{row.code} · {row.name}</span><span className="tabular-nums">{money(row.amount)}</span></div>)}{!rows.length && <p className="py-4 text-sm text-gray-500">No balances in this section.</p>}</div>
    <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-sm font-bold"><span>Total {title}</span><span>{money(total)}</span></div>
  </div>;

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Reports</p><h1 className="mt-1 text-2xl font-bold">Balance Sheet</h1><p className="mt-1 text-sm text-gray-600">Assets, liabilities and equity based on posted balances as of the selected date.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">As of date<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label><button onClick={() => void load()} disabled={loading} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Generating…" : "Generate report"}</button></div></section>
    {report && <><div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5"><div><p className="text-sm text-gray-500">Assets</p><p className="text-xl font-bold">{money(report.totals.assets)}</p></div><div><p className="text-sm text-gray-500">Liabilities + equity</p><p className="text-xl font-bold">{money(report.totals.liabilitiesAndEquity)}</p></div><span className={report.totals.isBalanced ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"}>{report.totals.isBalanced ? "Balanced" : "Difference detected"}</span></div><div className="mt-6 grid gap-5 xl:grid-cols-2">{section("Assets", report.assets, report.totals.assets)}<div className="space-y-5">{section("Liabilities", report.liabilities, report.totals.liabilities)}{section("Equity", report.equity, report.totals.equity)}<div className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex justify-between text-sm font-semibold"><span>Unclosed earnings (calculated)</span><span>{money(report.unclosedEarnings)}</span></div><p className="mt-2 text-xs text-gray-500">{report.note}</p></div></div></div></>}
  </main>;
}
