"use client";

import { useEffect, useState } from "react";

type Period = { id: string; name: string; startDate: string; endDate: string; status: "OPEN" | "CLOSED"; closedAt: string | null; _count: { journalEntries: number } };

export default function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/financial/periods", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load accounting periods.");
      setPeriods(data.periods);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load accounting periods."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function closePeriod(period: Period) {
    if (!window.confirm(`Close ${period.name}? New vouchers cannot be posted into a closed period.`)) return;
    setBusyId(period.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/financial/periods/${period.id}/close`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to close period.");
      setNotice(`${period.name} has been closed.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to close period."); }
    finally { setBusyId(""); }
  }

  const date = (value: string) => new Date(value).toLocaleDateString("en-IN");

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p><h1 className="mt-1 text-2xl font-bold">Accounting Periods</h1><p className="mt-1 text-sm text-gray-600">Review financial-year periods and close periods after all draft vouchers are resolved.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {loading ? <p className="py-8 text-sm text-gray-500">Loading periods…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Period</th><th className="py-3 pr-3">Start</th><th className="py-3 pr-3">End</th><th className="py-3 pr-3">Vouchers</th><th className="py-3 pr-3">Status</th><th className="py-3">Action</th></tr></thead>
        <tbody>{periods.map((period) => <tr key={period.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-3 font-medium">{period.name}</td><td className="py-3 pr-3">{date(period.startDate)}</td><td className="py-3 pr-3">{date(period.endDate)}</td><td className="py-3 pr-3">{period._count.journalEntries}</td><td className="py-3 pr-3"><span className={period.status === "OPEN" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"}>{period.status}</span></td><td className="py-3">{period.status === "OPEN" ? <button disabled={busyId === period.id} onClick={() => void closePeriod(period)} className="font-medium text-red-700 hover:underline disabled:opacity-40">{busyId === period.id ? "Closing…" : "Close period"}</button> : <span className="text-xs text-gray-500">{period.closedAt ? `Closed ${date(period.closedAt)}` : "—"}</span>}</td></tr>)}
        {!periods.length && <tr><td colSpan={6} className="py-8 text-center text-gray-500">No accounting periods configured.</td></tr>}</tbody>
      </table></div>}
    </section>
  </main>;
}
