"use client";

import { useEffect, useState } from "react";

type Account = { id: string; code: string; name: string; type: string; isActive: boolean; isControlAccount: boolean };
type PaymentAccount = { id: string; name: string; type: string; isActive: boolean };
type Category = { id: string; name: string; isActive: boolean; expenseAccount: { id: string; code: string; name: string }; _count?: { expenses: number } };
type Expense = { id: string; expenseNumber: string; expenseDate: string; amount: string; description: string; reference: string | null; category: { name: string; expenseAccount: { code: string; name: string } }; paymentAccount: { name: string; type: string }; journalEntry: { voucherNumber: string; status: string }; creator: { name: string } };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState({ categoryId: "", paymentAccountId: "", expenseDate: today(), amount: "", description: "", reference: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", expenseAccountId: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      const [a, p, c, e] = await Promise.all([
        fetch("/api/financial/accounts", { cache: "no-store" }),
        fetch("/api/financial/payment-accounts", { cache: "no-store" }),
        fetch("/api/financial/expenses/categories", { cache: "no-store" }),
        fetch("/api/financial/expenses", { cache: "no-store" }),
      ]);
      const [ad, pd, cd, ed] = await Promise.all([a.json(), p.json(), c.json(), e.json()]);
      for (const [response, data] of [[a, ad], [p, pd], [c, cd], [e, ed]] as const) if (!response.ok) throw new Error(data.error || "Unable to load expense workspace.");
      setAccounts(ad.accounts); setPaymentAccounts(pd.accounts); setCategories(cd.categories); setExpenses(ed.expenses);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load expense workspace."); }
  }
  useEffect(() => { void load(); }, []);

  async function save(url: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save record.");
      setNotice(success); await load(); return data;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save record."); return null; }
    finally { setBusy(false); }
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    const result = await save("/api/financial/expenses/categories", categoryForm, "Expense category created.");
    if (result) setCategoryForm({ name: "", expenseAccountId: "" });
  }
  async function createExpense(event: React.FormEvent) {
    event.preventDefault();
    const result = await save("/api/financial/expenses", form, "Expense recorded and posted to the General Ledger.");
    if (result) setForm({ ...form, amount: "", description: "", reference: "" });
  }

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE" && a.isActive && !a.isControlAccount);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p><h1 className="mt-1 text-2xl font-bold">Expense Management</h1><p className="mt-1 text-sm text-gray-600">Record operating expenses and automatically post each expense to the ledger.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Recorded expenses</p><p className="mt-2 text-2xl font-bold">{expenses.length}</p></article><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Total listed expenses</p><p className="mt-2 text-2xl font-bold">₹{money(String(total))}</p></article><article className="rounded-xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Active categories</p><p className="mt-2 text-2xl font-bold">{categories.filter((c) => c.isActive).length}</p></article></div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Record an expense</h2><form onSubmit={createExpense} className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Expense category<select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select category</option>{categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.expenseAccount.code}</option>)}</select></label>
        <label className="block text-sm font-medium">Paid from<select required value={form.paymentAccountId} onChange={(e) => setForm({ ...form, paymentAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select cash/bank account</option>{paymentAccounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Expense date<input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium">Amount (₹)<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label></div>
        <label className="block text-sm font-medium">Description<input required minLength={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Monthly showroom rent" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Bill / reference number<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <button disabled={busy || !categories.some((c) => c.isActive) || !paymentAccounts.some((a) => a.isActive)} className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Posting…" : "Record & post expense"}</button>
      </form></section>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Expense categories</h2><form onSubmit={createCategory} className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Category name<input required minLength={2} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Marketing" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Expense ledger account<select required value={categoryForm.expenseAccountId} onChange={(e) => setCategoryForm({ ...categoryForm, expenseAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select expense account</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <button disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Add category</button>
      </form><div className="mt-5 divide-y divide-gray-100">{categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{category.name}</p><p className="text-xs text-gray-500">{category.expenseAccount.code} · {category.expenseAccount.name}</p></div><span className="text-xs text-gray-500">{category._count?.expenses ?? 0} expenses</span></div>)}{!categories.length && <p className="py-5 text-sm text-gray-500">No categories configured.</p>}</div></section>
    </div>
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Expense register</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[60rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Expense no.</th><th className="py-3 pr-3">Category</th><th className="py-3 pr-3">Description</th><th className="py-3 pr-3">Paid from</th><th className="py-3 pr-3">Reference</th><th className="py-3 pr-3 text-right">Amount</th><th className="py-3">Voucher</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-gray-100"><td className="py-3 pr-3">{new Date(expense.expenseDate).toLocaleDateString("en-IN")}</td><td className="py-3 pr-3 font-mono text-xs">{expense.expenseNumber}</td><td className="py-3 pr-3">{expense.category.name}</td><td className="py-3 pr-3">{expense.description}</td><td className="py-3 pr-3">{expense.paymentAccount.name}</td><td className="py-3 pr-3">{expense.reference || "—"}</td><td className="py-3 pr-3 text-right tabular-nums">₹{money(expense.amount)}</td><td className="py-3 font-mono text-xs">{expense.journalEntry.voucherNumber}</td></tr>)}{!expenses.length && <tr><td colSpan={8} className="py-8 text-center text-gray-500">No expenses recorded.</td></tr>}</tbody></table></div></section>
  </main>;
}
