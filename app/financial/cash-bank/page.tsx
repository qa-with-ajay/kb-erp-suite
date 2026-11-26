"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerAccount = { id: string; code: string; name: string; type: string; isActive: boolean };
type PaymentAccount = { id: string; name: string; type: "CASH" | "BANK" | "UPI"; ledgerAccountId: string; ledgerAccount: Pick<LedgerAccount, "id" | "code" | "name">; bankName: string | null; balance: string; isActive: boolean };
type Transaction = { id: string; reconciliationItems?: Array<{ id: string }>; transactionNumber: string; type: "RECEIPT" | "PAYMENT" | "TRANSFER"; amount: string; transactionDate: string; narration: string; reference: string | null; paymentAccount: { id: string; name: string; type: string }; destinationAccount: { id: string; name: string; type: string } | null; offsetAccount: { id: string; code: string; name: string } | null; journalEntry: { voucherNumber: string; status: string } };
type Reconciliation = { id: string; statementDate: string; statementBalance: string; bookBalance: string; difference: string; status: string; paymentAccount: { name: string; type: string }; _count: { items: number } };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (value: string) => Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashBankPage() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", type: "BANK" as PaymentAccount["type"], ledgerAccountId: "", bankName: "", accountNumberLast4: "", ifsc: "", upiId: "" });
  const [txnForm, setTxnForm] = useState({ type: "RECEIPT" as Transaction["type"], paymentAccountId: "", destinationAccountId: "", offsetAccountId: "", amount: "", transactionDate: today(), narration: "", reference: "" });
  const [reconForm, setReconForm] = useState({ paymentAccountId: "", statementDate: today(), openingBalance: "", statementBalance: "", transactionIds: [] as string[], notes: "" });

  async function load() {
    setError("");
    try {
      const [a, l, t, r] = await Promise.all([
        fetch("/api/financial/payment-accounts", { cache: "no-store" }),
        fetch("/api/financial/accounts", { cache: "no-store" }),
        fetch("/api/financial/cash-bank", { cache: "no-store" }),
        fetch("/api/financial/reconciliations", { cache: "no-store" }),
      ]);
      const [ad, ld, td, rd] = await Promise.all([a.json(), l.json(), t.json(), r.json()]);
      for (const [response, data] of [[a, ad], [l, ld], [t, td], [r, rd]] as const) if (!response.ok) throw new Error(data.error || "Unable to load cash and bank records.");
      setAccounts(ad.accounts); setLedger(ld.accounts); setTransactions(td.transactions); setReconciliations(rd.reconciliations);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load cash and bank records."); }
  }
  useEffect(() => { void load(); }, []);

  const assetAccounts = useMemo(() => ledger.filter((account) => account.type === "ASSET" && account.isActive), [ledger]);
  const offsetAccounts = useMemo(() => ledger.filter((account) => account.isActive), [ledger]);
  const selectedRecon = accounts.find((account) => account.id === reconForm.paymentAccountId);

  async function submit(url: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save record.");
      setNotice(success); await load(); return data;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save record."); return null; }
    finally { setBusy(false); }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    const result = await submit("/api/financial/payment-accounts", accountForm, "Payment account created.");
    if (result) setAccountForm({ name: "", type: "BANK", ledgerAccountId: "", bankName: "", accountNumberLast4: "", ifsc: "", upiId: "" });
  }
  async function createTransaction(event: React.FormEvent) {
    event.preventDefault();
    const result = await submit("/api/financial/cash-bank", { ...txnForm, destinationAccountId: txnForm.type === "TRANSFER" ? txnForm.destinationAccountId : null, offsetAccountId: txnForm.type === "TRANSFER" ? null : txnForm.offsetAccountId }, "Cash/bank transaction posted to the ledger.");
    if (result) setTxnForm({ ...txnForm, amount: "", narration: "", reference: "" });
  }
  async function createReconciliation(event: React.FormEvent) {
    event.preventDefault();
    await submit("/api/financial/reconciliations", reconForm, "Reconciliation draft created. Complete it only when the difference is zero.");
  }
  async function completeReconciliation(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/financial/reconciliations/${id}/complete`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to complete reconciliation.");
      setNotice("Bank reconciliation completed."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to complete reconciliation."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-gray-50 p-5 md:p-10">
    <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Financial Management</p><h1 className="mt-1 text-2xl font-bold">Cash & Bank</h1><p className="mt-1 text-sm text-gray-600">Manage payment accounts, record cash/bank movements and reconcile bank statements.</p></header>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => <article key={account.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{account.name}</h2><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{account.type}</span></div><p className="mt-1 text-xs text-gray-500">{account.ledgerAccount.code} · {account.ledgerAccount.name}</p>{account.bankName && <p className="mt-1 text-xs text-gray-500">{account.bankName}</p>}<p className="mt-4 text-xl font-bold tabular-nums">₹{money(account.balance)}</p><p className="text-xs text-gray-500">Ledger balance</p></article>)}</section>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Add payment account</h2><form onSubmit={createAccount} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Account name<input required minLength={2} value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="HDFC Current Account" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium">Type<select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as PaymentAccount["type"] })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option></select></label>
        <label className="text-sm font-medium">Ledger account<select required value={accountForm.ledgerAccountId} onChange={(e) => setAccountForm({ ...accountForm, ledgerAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select asset account</option>{assetAccounts.filter((a) => !accounts.some((p) => p.ledgerAccountId === a.id)).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        {accountForm.type === "BANK" && <><label className="text-sm font-medium">Bank name<input value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium">Last 4 digits<input inputMode="numeric" maxLength={4} value={accountForm.accountNumberLast4} onChange={(e) => setAccountForm({ ...accountForm, accountNumberLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium sm:col-span-2">IFSC<input maxLength={11} value={accountForm.ifsc} onChange={(e) => setAccountForm({ ...accountForm, ifsc: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label></>}
        {accountForm.type === "UPI" && <label className="text-sm font-medium sm:col-span-2">UPI ID<input value={accountForm.upiId} onChange={(e) => setAccountForm({ ...accountForm, upiId: e.target.value })} placeholder="business@upi" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>}
        <button disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? "Saving…" : "Create account"}</button>
      </form></section>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Record transaction</h2><form onSubmit={createTransaction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Transaction type<select value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value as Transaction["type"], destinationAccountId: "", offsetAccountId: "" })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="RECEIPT">Receipt</option><option value="PAYMENT">Payment</option><option value="TRANSFER">Transfer</option></select></label>
        <label className="text-sm font-medium">From account<select required value={txnForm.paymentAccountId} onChange={(e) => setTxnForm({ ...txnForm, paymentAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select account</option>{accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {txnForm.type === "TRANSFER" ? <label className="text-sm font-medium sm:col-span-2">To account<select required value={txnForm.destinationAccountId} onChange={(e) => setTxnForm({ ...txnForm, destinationAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select destination</option>{accounts.filter((a) => a.isActive && a.id !== txnForm.paymentAccountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : <label className="text-sm font-medium sm:col-span-2">Offset ledger account<select required value={txnForm.offsetAccountId} onChange={(e) => setTxnForm({ ...txnForm, offsetAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select ledger account</option>{offsetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>}
        <label className="text-sm font-medium">Amount<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium">Date<input required type="date" value={txnForm.transactionDate} onChange={(e) => setTxnForm({ ...txnForm, transactionDate: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium sm:col-span-2">Narration<input required minLength={3} value={txnForm.narration} onChange={(e) => setTxnForm({ ...txnForm, narration: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium sm:col-span-2">Reference (optional)<input value={txnForm.reference} onChange={(e) => setTxnForm({ ...txnForm, reference: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <button disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? "Posting…" : "Post transaction"}</button>
      </form></section>
    </div>
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Cash book / Bank book</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[58rem] text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Voucher</th><th className="py-3 pr-3">Type</th><th className="py-3 pr-3">Account</th><th className="py-3 pr-3">Narration</th><th className="py-3 pr-3">Reference</th><th className="py-3 text-right">Amount</th></tr></thead><tbody>{transactions.map((t) => <tr key={t.id} className="border-b border-gray-100"><td className="py-3 pr-3">{new Date(t.transactionDate).toLocaleDateString("en-IN")}</td><td className="py-3 pr-3 font-mono text-xs">{t.transactionNumber}</td><td className="py-3 pr-3">{t.type}</td><td className="py-3 pr-3">{t.paymentAccount.name}{t.destinationAccount ? ` → ${t.destinationAccount.name}` : ""}</td><td className="py-3 pr-3">{t.narration}</td><td className="py-3 pr-3">{t.reference || "—"}</td><td className="py-3 text-right tabular-nums">₹{money(t.amount)}</td></tr>)}{!transactions.length && <tr><td colSpan={7} className="py-8 text-center text-gray-500">No cash/bank transactions recorded.</td></tr>}</tbody></table></div></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Bank reconciliation</h2><p className="mt-1 text-sm text-gray-600">Compare the statement closing balance with the posted ledger balance.</p><form onSubmit={createReconciliation} className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Bank / UPI account<select required value={reconForm.paymentAccountId} onChange={(e) => setReconForm({ ...reconForm, paymentAccountId: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select account</option>{accounts.filter((a) => a.isActive && a.type !== "CASH").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Statement date<input required type="date" value={reconForm.statementDate} onChange={(e) => setReconForm({ ...reconForm, statementDate: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Statement opening balance<input required inputMode="decimal" value={reconForm.openingBalance} onChange={(e) => setReconForm({ ...reconForm, openingBalance: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Statement closing balance<input required inputMode="decimal" value={reconForm.statementBalance} onChange={(e) => setReconForm({ ...reconForm, statementBalance: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Notes (optional)<input value={reconForm.notes} onChange={(e) => setReconForm({ ...reconForm, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <fieldset className="rounded-lg border border-gray-200 p-3"><legend className="px-1 text-sm font-medium">Transactions appearing on this statement</legend><div className="max-h-40 space-y-2 overflow-y-auto">{transactions.filter((t) => !t.reconciliationItems?.length && t.transactionDate.slice(0, 10) <= reconForm.statementDate && (t.paymentAccount.id === reconForm.paymentAccountId || t.destinationAccount?.id === reconForm.paymentAccountId)).map((t) => <label key={t.id} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={reconForm.transactionIds.includes(t.id)} onChange={(e) => setReconForm((current) => ({ ...current, transactionIds: e.target.checked ? [...current.transactionIds, t.id] : current.transactionIds.filter((id) => id !== t.id) }))} className="mt-0.5" /><span>{t.transactionNumber} · {t.narration} · ₹{money(t.amount)}</span></label>)}{!transactions.some((t) => !t.reconciliationItems?.length && (t.paymentAccount.id === reconForm.paymentAccountId || t.destinationAccount?.id === reconForm.paymentAccountId)) && <p className="text-xs text-gray-500">No unreconciled cash/bank vouchers are available for this account.</p>}</div></fieldset>
        <p className="text-xs text-gray-500">{selectedRecon ? `Current ledger balance: ₹${money(selectedRecon.balance)}. Select transactions shown on the statement; opening balance plus matched movements must equal the statement closing balance.` : "Select an account to view its ledger balance."}</p>
        <button disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create reconciliation"}</button>
      </form></div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Reconciliation history</h2><div className="mt-3 space-y-3">{reconciliations.map((r) => <article key={r.id} className="rounded-lg border border-gray-100 p-3"><div className="flex flex-wrap justify-between gap-2"><div className="font-medium">{r.paymentAccount.name} · {new Date(r.statementDate).toLocaleDateString("en-IN")}</div><span className={r.status === "RECONCILED" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800"}>{r.status}</span></div><p className="mt-1 text-sm text-gray-600">Statement ₹{money(r.statementBalance)} · Book ₹{money(r.bookBalance)} · Difference ₹{money(r.difference)}</p><p className="text-xs text-gray-500">{r._count.items} matched transactions</p>{r.status === "DRAFT" && <button disabled={busy} onClick={() => void completeReconciliation(r.id)} className="mt-2 text-sm font-semibold text-emerald-800 hover:underline">Complete if balanced</button>}</article>)}{!reconciliations.length && <p className="py-6 text-sm text-gray-500">No reconciliations yet.</p>}</div></div>
    </section>
  </main>;
}
