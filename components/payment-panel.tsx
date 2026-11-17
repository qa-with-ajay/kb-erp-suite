"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";
type PaymentRow = {
  id: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  recordedBy: string;
  reversedBy: string | null;
};
type PaymentData = {
  total: string;
  paidAmount: string;
  balanceDue: string;
  payments: PaymentRow[];
};

const methods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

function localDateValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function money(value: string, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function methodLabel(value: PaymentMethod) {
  return methods.find((method) => method.value === value)?.label ?? value;
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  const error = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : undefined;
  if (!response.ok) throw new Error(error ?? "The request could not be completed.");
  return body as T;
}

export function PaymentPanel({
  endpoint,
  currency,
  canManage,
}: {
  endpoint: string;
  currency: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [reversingId, setReversingId] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    setData(await readJson<PaymentData>(response));
  }, [endpoint]);

  useEffect(() => {
    setPaidAt(localDateValue());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    reload(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load payment history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key,
          amount,
          method,
          paidAt,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const result = await readJson<{ replayed: boolean }>(response);
      setAmount("");
      setReference("");
      setNotes("");
      setRequestKey("");
      setNotice(result.replayed ? "This payment was already recorded." : "Payment recorded.");
      try {
        await reload();
      } catch {
        setError("Payment was recorded, but the history could not be refreshed. Reload this page to see the latest balance.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReversal(payment: PaymentRow) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${payment.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      await readJson(response);
      setReversingId("");
      setReversalReason("");
      setNotice("Payment reversed. Its balance is outstanding again.");
      try {
        await reload();
      } catch {
        setError("Payment was reversed, but the history could not be refreshed. Reload this page to see the updated balance.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reverse payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Payments</h2>
          <p className="mt-1 text-sm text-gray-600">Record collections or payments against this invoice.</p>
        </div>
        {data && (
          <div className="grid grid-cols-3 gap-3 text-right text-sm">
            <div><p className="text-xs text-gray-500">Invoice total</p><p className="mt-1 font-semibold">{money(data.total, currency)}</p></div>
            <div><p className="text-xs text-gray-500">Paid</p><p className="mt-1 font-semibold text-emerald-800">{money(data.paidAmount, currency)}</p></div>
            <div><p className="text-xs text-gray-500">Balance due</p><p className="mt-1 font-semibold text-amber-800">{money(data.balanceDue, currency)}</p></div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading ? <p className="mt-5 text-sm text-gray-600">Loading payments…</p> : data && (
        <>
          {data.payments.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Method</th><th className="py-2 pr-4">Reference</th><th className="py-2 pr-4">Recorded by</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.payments.map((payment) => (
                    <tr key={payment.id} className={payment.reversedAt ? "text-gray-400" : ""}>
                      <td className="py-3 pr-4">{new Date(payment.paidAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 pr-4">{methodLabel(payment.method)}</td>
                      <td className="py-3 pr-4">{payment.reference || "—"}{payment.notes && <span className="mt-1 block text-xs">{payment.notes}</span>}</td>
                      <td className="py-3 pr-4">{payment.recordedBy}</td>
                      <td className={`py-3 text-right font-medium ${payment.reversedAt ? "line-through" : ""}`}>{money(payment.amount, currency)}</td>
                      <td className="py-3 text-right">
                        {payment.reversedAt ? (
                          <span title={`${payment.reversalReason || "Reversed"}${payment.reversedBy ? ` · ${payment.reversedBy}` : ""}`} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">Reversed</span>
                        ) : canManage ? (
                          reversingId === payment.id ? (
                            <div className="flex min-w-48 flex-col items-end gap-2">
                              <input aria-label="Payment reversal reason" required minLength={3} maxLength={500} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Reason for reversal" className="w-full rounded border border-gray-300 p-2 text-left text-xs" />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setReversingId(""); setReversalReason(""); }} className="text-xs hover:underline">Cancel</button>
                                <button type="button" disabled={saving || reversalReason.trim().length < 3} onClick={() => submitReversal(payment)} className="text-xs font-semibold text-red-700 disabled:opacity-50">{saving ? "Reversing…" : "Confirm reverse"}</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setReversingId(payment.id); setReversalReason(""); }} className="text-xs font-medium text-red-700 hover:underline">Reverse</button>
                          )
                        ) : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">Recorded</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No payments recorded yet.</p>}

          {canManage && Number(data.balanceDue) > 0 && (
            <form onSubmit={submitPayment} className="mt-5 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold">Record a payment</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-medium">
                  Amount *
                  <input required type="number" min="0.01" max={data.balanceDue} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5" />
                </label>
                <label className="text-sm font-medium">
                  Method *
                  <select value={method} onChange={(event) => {
                    const selected = methods.find((option) => option.value === event.target.value);
                    if (selected) setMethod(selected.value);
                  }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    {methods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Payment date *
                  <input required type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5" />
                </label>
                <label className="text-sm font-medium">
                  Reference
                  <input maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction or cheque number" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5" />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Notes
                  <input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5" />
                </label>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={saving || !amount} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Recording…" : "Record payment"}</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
