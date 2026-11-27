"use client";

import { useEffect, useState } from "react";

type Row = { id: string; code: string; name: string; type: string; totalDebit: string; totalCredit: string; debitBalance: string; creditBalance: string };
type Report = { asOf: string; rows: Row[]; totals: { debit: string; credit: string; isBalanced: boolean } };

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(getBusinessDateString());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ asOf });
      const unitId = new URLSearchParams(window.location.search).get("businessUnitId");
      if (unitId) params.set("businessUnitId", unitId);
      const response = await fetch(`/api/financial/reports/trial-balance?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load trial balance.");
      setReport(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load trial balance."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Reports</p><h1 className="mt-1 text-2xl font-bold">Trial Balance</h1><p className="mt-1 text-sm text-gray-600">Account balances calculated from posted journal entries only.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">As of date<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label><button onClick={() => void load()} disabled={loading} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "Generate report"}</button></div>
      {report && <><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-600">As of {new Date(report.asOf + "T00:00:00").toLocaleDateString("en-IN")}</p><span className={report.totals.isBalanced ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-800"}>{report.totals.isBalanced ? "Balanced" : "Out of balance"}</span></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Code</th><th className="py-3 pr-3">Account</th><th className="py-3 pr-3">Type</th><th className="py-3 pr-3 text-right">Debit</th><th className="py-3 text-right">Credit</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-3 font-mono text-xs">{row.code}</td><td className="py-3 pr-3 font-medium">{row.name}</td><td className="py-3 pr-3 text-gray-600">{row.type}</td><td className="py-3 pr-3 text-right">{Number(row.debitBalance) ? money(row.debitBalance) : "—"}</td><td className="py-3 text-right">{Number(row.creditBalance) ? money(row.creditBalance) : "—"}</td></tr>)}</tbody><tfoot className="border-t-2 border-gray-300 font-bold"><tr><td colSpan={3} className="py-3 text-right">Total</td><td className="py-3 pr-3 text-right">{money(report.totals.debit)}</td><td className="py-3 text-right">{money(report.totals.credit)}</td></tr></tfoot></table></div></>}
    </section>
  </main>;
}
