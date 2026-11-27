"use client";

import { useEffect, useState } from "react";

type Account = { id: string; code: string; name: string; type: string };
type LedgerRow = { id: string; voucherNumber: string; entryDate: string; narration: string; description: string | null; debit: string; credit: string; runningBalance: string; balanceSide: "DR" | "CR" };
type Ledger = { account: Account; openingBalance: string; closingBalance: string; totalDebit: string; totalCredit: string; rows: LedgerRow[] };

const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GeneralLedgerPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const unitId = new URLSearchParams(window.location.search).get("businessUnitId");
        const response = await fetch(`/api/financial/accounts${unitId ? `?businessUnitId=${encodeURIComponent(unitId)}` : ""}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load accounts.");
        setAccounts(data.accounts);
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to load accounts."); }
    })();
  }, []);

  async function load() {
    if (!accountId) { setError("Select an account."); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ accountId });
      const unitId = new URLSearchParams(window.location.search).get("businessUnitId");
      if (unitId) params.set("businessUnitId", unitId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/financial/reports/general-ledger?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load account ledger.");
      setLedger(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load account ledger."); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Reports</p><h1 className="mt-1 text-2xl font-bold">General Ledger</h1><p className="mt-1 text-sm text-gray-600">Account-wise movement and running balances from posted vouchers.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[minmax(16rem,2fr)_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium">Account<select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className="text-sm font-medium">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <button onClick={() => void load()} disabled={loading || !accountId} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "View ledger"}</button>
      </div>
    </section>
    {ledger && <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{ledger.account.code} · {ledger.account.name}</h2><p className="mt-1 text-sm text-gray-500">{ledger.account.type}</p></div><div className="text-right text-sm"><p className="text-gray-500">Opening balance</p><p className="font-semibold">{money(ledger.openingBalance)} {Number(ledger.openingBalance) < 0 ? "CR" : "DR"}</p></div></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[58rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Voucher</th><th className="py-3 pr-3">Narration</th><th className="py-3 pr-3 text-right">Debit</th><th className="py-3 pr-3 text-right">Credit</th><th className="py-3 text-right">Balance</th></tr></thead><tbody>{ledger.rows.map((row) => <tr key={row.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-3 whitespace-nowrap">{new Date(row.entryDate).toLocaleDateString("en-IN")}</td><td className="py-3 pr-3 font-mono text-xs">{row.voucherNumber}</td><td className="py-3 pr-3">{row.description || row.narration}</td><td className="py-3 pr-3 text-right">{Number(row.debit) ? money(row.debit) : "—"}</td><td className="py-3 pr-3 text-right">{Number(row.credit) ? money(row.credit) : "—"}</td><td className="py-3 text-right font-medium">{money(row.runningBalance)} {row.balanceSide}</td></tr>)}{!ledger.rows.length && <tr><td colSpan={6} className="py-8 text-center text-gray-500">No posted entries for this account and date range.</td></tr>}</tbody></table></div>
      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-3"><div><p className="text-gray-500">Total debits</p><p className="font-semibold">{money(ledger.totalDebit)}</p></div><div><p className="text-gray-500">Total credits</p><p className="font-semibold">{money(ledger.totalCredit)}</p></div><div><p className="text-gray-500">Closing balance</p><p className="font-semibold">{money(ledger.closingBalance)} {Number(ledger.closingBalance) < 0 ? "CR" : "DR"}</p></div></div>
    </section>}
  </main>;
}
