"use client";

import { useEffect, useMemo, useState } from "react";
import { getBusinessDateString } from "@/lib/accounting-date";

type Account = { id: string; code: string; name: string; type: string };
type JournalLine = { id: string; accountId: string; debit: string | number; credit: string | number; description: string | null; account: { code: string; name: string } };
type JournalEntry = {
  id: string; voucherNumber: string; entryDate: string; narration: string; status: "DRAFT" | "POSTED" | "REVERSED";
  period: { name: string; status: string }; lines: JournalLine[];
};

type DraftLine = { accountId: string; debit: string; credit: string; description: string };

function amount(value: string | number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JournalVouchersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entryDate, setEntryDate] = useState(getBusinessDateString());
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: "", debit: "", credit: "", description: "" },
    { accountId: "", debit: "", credit: "", description: "" },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [accountResponse, journalResponse] = await Promise.all([
        fetch("/api/financial/accounts", { cache: "no-store" }),
        fetch("/api/financial/journals", { cache: "no-store" }),
      ]);
      const [accountData, journalData] = await Promise.all([accountResponse.json(), journalResponse.json()]);
      if (!accountResponse.ok) throw new Error(accountData.error || "Unable to load chart of accounts.");
      if (!journalResponse.ok) throw new Error(journalData.error || "Unable to load journal vouchers.");
      setAccounts(accountData.accounts.filter((account: Account & { isActive?: boolean }) => account.isActive !== false));
      setEntries(journalData.entries);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load accounting data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const totalDebit = useMemo(() => lines.reduce((sum, line) => sum + Number(line.debit || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((sum, line) => sum + Number(line.credit || 0), 0), [lines]);
  const balanced = totalDebit > 0 && Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  function updateLine(index: number, key: keyof DraftLine, value: string) {
    setLines((current) => current.map((line, i) => i === index ? {
      ...line, [key]: value,
      ...(key === "debit" && Number(value) > 0 ? { credit: "0" } : {}),
      ...(key === "credit" && Number(value) > 0 ? { debit: "0" } : {}),
    } : line));
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(editingId ? `/api/financial/journals/${editingId}` : "/api/financial/journals", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate, narration, lines: lines.map((line) => ({ ...line, debit: line.debit || "0", credit: line.credit || "0" })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create journal voucher.");
      setNarration(""); setEditingId(null);
      setLines([{ accountId: "", debit: "", credit: "", description: "" }, { accountId: "", debit: "", credit: "", description: "" }]);
      setNotice(editingId ? `Draft ${data.entry.voucherNumber} updated successfully.` : `Draft ${data.entry.voucherNumber} created successfully.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create journal voucher."); }
    finally { setSaving(false); }
  }

  function editDraft(entry: JournalEntry) {
    setEditingId(entry.id);
    setEntryDate(new Date(entry.entryDate).toISOString().slice(0, 10));
    setNarration(entry.narration);
    setLines(entry.lines.map((line) => ({
      accountId: line.accountId,
      debit: String(line.debit),
      credit: String(line.credit),
      description: line.description || "",
    })));
    setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteDraft(entry: JournalEntry) {
    if (!window.confirm(`Delete draft ${entry.voucherNumber}? This cannot be undone.`)) return;
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/financial/journals/${entry.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete draft.");
      if (editingId === entry.id) {
        setEditingId(null); setNarration("");
        setLines([{ accountId: "", debit: "", credit: "", description: "" }, { accountId: "", debit: "", credit: "", description: "" }]);
      }
      setNotice(`Draft ${entry.voucherNumber} deleted.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete draft."); }
  }

  async function action(id: string, actionName: "post" | "reverse") {
    if (actionName === "reverse" && !window.confirm("Reverse this posted voucher? A new opposite journal entry will be created.")) return;
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/financial/journals/${id}/${actionName}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: actionName === "reverse" ? JSON.stringify({ reason: "Reversal requested from Journal Vouchers" }) : "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Unable to ${actionName} voucher.`);
      setNotice(actionName === "post" ? "Journal voucher posted." : `Reversal voucher ${data.reversal.voucherNumber} created.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Accounting action failed."); }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-950">Journal Vouchers</h1>
        <p className="mt-1 text-sm text-gray-600">Create balanced drafts, post to the General Ledger, and reverse posted vouchers with an audit trail.</p>
      </header>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{editingId ? "Edit journal draft" : "Create journal draft"}</h2>
        <form onSubmit={createDraft} className="mt-4 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium">Voucher date<input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Narration<input required minLength={3} maxLength={500} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Reason for this journal entry" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-3">Account</th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Debit</th><th className="py-2 pr-3">Credit</th><th className="py-2"> </th></tr></thead>
              <tbody>{lines.map((line, index) => <tr key={index} className="border-b border-gray-100">
                <td className="py-2 pr-3"><select required value={line.accountId} onChange={(e) => updateLine(index, "accountId", e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-2"><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
                <td className="py-2 pr-3"><input value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} maxLength={250} placeholder="Optional" className="w-full rounded-md border border-gray-300 px-2 py-2" /></td>
                <td className="py-2 pr-3"><input type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateLine(index, "debit", e.target.value)} placeholder="0.00" className="w-32 rounded-md border border-gray-300 px-2 py-2 text-right" /></td>
                <td className="py-2 pr-3"><input type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateLine(index, "credit", e.target.value)} placeholder="0.00" className="w-32 rounded-md border border-gray-300 px-2 py-2 text-right" /></td>
                <td className="py-2"><button type="button" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-sm text-red-700 disabled:opacity-30">Remove</button></td>
              </tr>)}</tbody>
              <tfoot className="font-semibold"><tr><td colSpan={2} className="py-3 text-right">Totals</td><td className="py-3 pr-3 text-right">{amount(totalDebit)}</td><td className="py-3 pr-3 text-right">{amount(totalCredit)}</td><td /></tr></tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setLines((current) => [...current, { accountId: "", debit: "", credit: "", description: "" }])} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Add line</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setNarration(""); setLines([{ accountId: "", debit: "", credit: "", description: "" }, { accountId: "", debit: "", credit: "", description: "" }]); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Cancel edit</button>}
            <div className="flex items-center gap-3"><span className={balanced ? "text-sm font-semibold text-emerald-700" : "text-sm text-amber-700"}>{balanced ? "Debits and credits balance" : "Voucher must balance before it can be posted"}</span><button disabled={saving || !balanced || !narration.trim() || lines.some((line) => !line.accountId)} className="rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : editingId ? "Update draft" : "Save draft"}</button></div>
          </div>
        </form>
      </section>

      <section className="mt-7 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Journal register</h2><span className="text-xs text-gray-500">Latest 100 vouchers</span></div>
        {loading ? <p className="py-8 text-sm text-gray-500">Loading journal register…</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Voucher</th><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Narration</th><th className="py-3 pr-3">Period</th><th className="py-3 pr-3">Debit total</th><th className="py-3 pr-3">Status</th><th className="py-3">Action</th></tr></thead>
              <tbody>{entries.map((entry) => {
                const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
                return <tr key={entry.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-3 font-mono text-xs">{entry.voucherNumber}</td>
                  <td className="py-3 pr-3 whitespace-nowrap">{new Date(entry.entryDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 pr-3 max-w-xs truncate">{entry.narration}</td>
                  <td className="py-3 pr-3">{entry.period.name}</td>
                  <td className="py-3 pr-3 text-right">{amount(debit)}</td>
                  <td className="py-3 pr-3"><span className={entry.status === "POSTED" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : entry.status === "DRAFT" ? "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800" : "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"}>{entry.status}</span></td>
                  <td className="py-3">{entry.status === "DRAFT" ? <div className="flex gap-3"><button onClick={() => editDraft(entry)} className="font-medium text-blue-700 hover:underline">Edit</button><button onClick={() => void action(entry.id, "post")} className="font-medium text-emerald-800 hover:underline">Post</button><button onClick={() => void deleteDraft(entry)} className="font-medium text-red-700 hover:underline">Delete</button></div> : entry.status === "POSTED" ? <button onClick={() => void action(entry.id, "reverse")} className="font-medium text-red-700 hover:underline">Reverse</button> : <span className="text-xs text-gray-400">—</span>}</td>
                </tr>;
              })}
              {!entries.length && <tr><td colSpan={7} className="py-8 text-center text-gray-500">No journal vouchers have been created.</td></tr>}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
