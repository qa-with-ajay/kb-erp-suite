"use client";

import { useEffect, useState } from "react";

type Account = {
  id: string; code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  description: string | null; parentAccountId: string | null; isSystem: boolean;
  isControlAccount: boolean; isActive: boolean; _count: { journalLines: number; children: number };
  parent: { id: string; code: string; name: string } | null;
};

const accountTypes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET" as Account["type"], description: "", parentAccountId: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/financial/accounts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load accounts.");
      setAccounts(data.accounts);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load accounts."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = accounts.filter((account) => {
    const q = search.trim().toLowerCase();
    return !q || account.code.toLowerCase().includes(q) || account.name.toLowerCase().includes(q);
  });

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/financial/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parentAccountId: form.parentAccountId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create account.");
      setForm({ code: "", name: "", type: "ASSET", description: "", parentAccountId: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create account."); }
    finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-950">Chart of Accounts</h1>
        <p className="mt-1 text-sm text-gray-600">Manage the accounts used by journal vouchers and financial statements.</p>
      </header>
      {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Accounts ({filtered.length})</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-64" />
          </div>
          {loading ? <p className="py-8 text-sm text-gray-500">Loading accounts…</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr><th className="py-3 pr-3">Code</th><th className="py-3 pr-3">Account name</th><th className="py-3 pr-3">Type</th><th className="py-3 pr-3">Parent</th><th className="py-3">Usage</th></tr>
                </thead>
                <tbody>
                  {filtered.map((account) => <tr key={account.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs">{account.code}</td>
                    <td className="py-3 pr-3"><div className="font-medium text-gray-900">{account.name}</div>{account.isSystem && <span className="text-xs text-gray-500">System account</span>}</td>
                    <td className="py-3 pr-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{account.type}</span></td>
                    <td className="py-3 pr-3 text-gray-600">{account.parent ? account.parent.code + " · " + account.parent.name : "—"}</td>
                    <td className="py-3 text-gray-600">{account._count.journalLines} lines</td>
                  </tr>)}
                  {!filtered.length && <tr><td colSpan={5} className="py-8 text-center text-gray-500">No accounts found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Create account</h2>
          <p className="mt-1 text-sm text-gray-600">Account codes must be unique within this business unit.</p>
          <form onSubmit={createAccount} className="mt-5 space-y-4">
            <label className="block text-sm font-medium">Account code<input required minLength={2} maxLength={24} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Account name<input required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Account type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"], parentAccountId: "" })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="block text-sm font-medium">Parent account (optional)<select value={form.parentAccountId} onChange={(e) => setForm({ ...form, parentAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">No parent</option>{accounts.filter((a) => a.type === form.type && a.isActive).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
            <label className="block text-sm font-medium">Description<textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <button disabled={saving} className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Create account"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
