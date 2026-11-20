"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type ReturnLine = {
  id: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: string;
  returnedQuantity: string;
  availableQuantity: string;
  variantCode?: string | null;
  variantAttributes?: unknown;
  baseUnit?: string;
  conversionFactor?: string;
  conversionPrecision?: number;
};

type ReturnHistory = {
  id: string;
  number: string;
  reason: string;
  locationName: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  createdAt: string;
  createdBy: string;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedBy: string | null;
  lines: Array<{
    id: string;
    productName: string;
    sku: string;
    unit: string;
    quantity: string;
    lineTotal: string;
    disposition?: "RESTOCK" | "DAMAGED";
  }>;
};

type ReturnData = {
  total: string;
  returnedAmount: string;
  paidAmount: string;
  balanceDue: string;
  creditBalance: string;
  defaultLocationId: string | null;
  locations: Array<{ id: string; name: string; code: string }>;
  lines: ReturnLine[];
  returns: ReturnHistory[];
};

type ReturnRequestLine =
  | { saleLineId: string; quantity: string; disposition: "RESTOCK" | "DAMAGED" }
  | { receiptLineId: string; purchaseQuantity: string };

function money(value: string, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatVariant(line: ReturnLine) {
  const entries = line.variantAttributes && typeof line.variantAttributes === "object" && !Array.isArray(line.variantAttributes)
    ? Object.entries(line.variantAttributes).map(([key, value]) => `${key}: ${String(value)}`)
    : [];
  return [line.variantCode, ...entries].filter(Boolean).join(" · ");
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  const error = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : undefined;
  if (!response.ok) throw new Error(error ?? "The request could not be completed.");
  return body as T;
}

export function ReturnPanel({
  endpoint,
  kind,
  currency,
  canManage,
}: {
  endpoint: string;
  kind: "sale" | "purchase";
  currency: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ReturnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dispositions, setDispositions] = useState<Record<string, "RESTOCK" | "DAMAGED">>({});
  const [requestKey, setRequestKey] = useState("");
  const [reversingId, setReversingId] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalKeys, setReversalKeys] = useState<Record<string, string>>({});

  const reload = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    const loaded = await readJson<ReturnData>(response);
    setData(loaded);
    setLocationId((current) => (
      loaded.locations.some((location) => location.id === current)
        ? current
        : loaded.locations.find((location) => location.id === loaded.defaultLocationId)?.id || loaded.locations[0]?.id || ""
    ));
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    reload(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load return history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    setError("");
    setNotice("");
    const lines = data.lines.flatMap((line): ReturnRequestLine[] => {
      const quantity = quantities[line.id]?.trim();
      if (!quantity || Number(quantity) <= 0) return [];
      return kind === "sale"
        ? [{ saleLineId: line.id, quantity, disposition: dispositions[line.id] || "RESTOCK" }]
        : [{ receiptLineId: line.id, purchaseQuantity: quantity }];
    });
    if (!lines.length) {
      setSaving(false);
      setError("Enter a return quantity for at least one item.");
      return;
    }
    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key, locationId, reason: reason.trim(), lines }),
      });
      const result = await readJson<{ number: string; replayed: boolean }>(response);
      setRequestKey("");
      setReason("");
      setQuantities({});
      setDispositions({});
      setFormOpen(false);
      setNotice(result.replayed ? `${result.number} was already recorded.` : `${result.number} recorded.`);
      router.refresh(); // re-render the invoice with updated returns / balance
      try {
        await reload();
      } catch {
        setError("The return was recorded, but history could not be refreshed. Reload this page to see the latest balance.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record the return.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReversal(item: ReturnHistory) {
    setSaving(true);
    setError("");
    setNotice("");
    const key = reversalKeys[item.id] || crypto.randomUUID();
    setReversalKeys((current) => ({ ...current, [item.id]: key }));
    try {
      const response = await fetch(`${endpoint}/${item.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key, reason: reversalReason.trim() }),
      });
      const result = await readJson<{ replayed: boolean }>(response);
      setReversingId("");
      setReversalReason("");
      setReversalKeys((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice(result.replayed ? "This return reversal was already recorded." : "Return reversed. Its credit and stock effect have been cancelled.");
      router.refresh();
      try {
        await reload();
      } catch {
        setError("The return was reversed, but history could not be refreshed. Reload this page to see the latest balance.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reverse the return.");
    } finally {
      setSaving(false);
    }
  }

  const title = kind === "sale" ? "Sales returns" : "Purchase returns";
  const noteLabel = kind === "sale" ? "Credit notes" : "Debit notes";
  const hasAvailableLines = Boolean(data?.lines.some((line) => Number(line.availableQuantity) > 0));

  return (
    <section className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">Returns create account credit; no cash refund is issued automatically.</p>
        </div>
        {data && (
          <div className="grid grid-cols-2 gap-3 text-right text-sm sm:grid-cols-4">
            <div><p className="text-xs text-gray-500">Document total</p><p className="mt-1 font-semibold">{money(data.total, currency)}</p></div>
            <div><p className="text-xs text-gray-500">{noteLabel}</p><p className="mt-1 font-semibold">{money(data.returnedAmount, currency)}</p></div>
            <div><p className="text-xs text-gray-500">Paid</p><p className="mt-1 font-semibold">{money(data.paidAmount, currency)}</p></div>
            <div>
              <p className="text-xs text-gray-500">{Number(data.creditBalance) > 0 ? "Account credit" : "Balance due"}</p>
              <p className="mt-1 font-semibold">{money(Number(data.creditBalance) > 0 ? data.creditBalance : data.balanceDue, currency)}</p>
            </div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading ? <p className="mt-5 text-sm text-gray-600">Loading return history…</p> : data && (
        <>
          {canManage && hasAvailableLines && !formOpen && (
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setFormOpen(true)} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                {kind === "sale" ? "Create sales return" : "Return to supplier"}
              </button>
            </div>
          )}

          {formOpen && canManage && (
            <form onSubmit={submitReturn} className="mt-5 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">{kind === "sale" ? "Create credit note" : "Create debit note"}</h3>
                <button type="button" onClick={() => setFormOpen(false)} className="text-sm text-gray-600 hover:underline">Cancel</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Stock location *
                  <select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select a location</option>
                    {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Reason *
                  <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5" placeholder="Reason for return" />
                </label>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                    <tr><th className="p-3">Item</th><th className="p-3">Available</th><th className="p-3">Return qty</th>{kind === "sale" && <th className="p-3">Stock status</th>}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.lines.map((line) => {
                      const variant = formatVariant(line);
                      const available = Number(line.availableQuantity);
                      return (
                        <tr key={line.id} className={available <= 0 ? "text-gray-400" : ""}>
                          <td className="p-3">
                            <p className="font-medium">{line.productName}</p>
                            <p className="mt-1 text-xs text-gray-500">{line.sku}{variant ? ` · ${variant}` : ""}</p>
                          </td>
                          <td className="p-3">{line.availableQuantity} {line.unit}{kind === "purchase" && line.baseUnit && line.baseUnit !== line.unit && <span className="block text-xs text-gray-500">base unit: {line.baseUnit}</span>}</td>
                          <td className="p-3">
                            <input
                              aria-label={`Return quantity for ${line.productName}`}
                              type="number"
                              min="0"
                              max={line.availableQuantity}
                              step={kind === "sale" ? "1" : "0.0001"}
                              value={quantities[line.id] || ""}
                              onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                              disabled={available <= 0}
                              className="w-32 rounded-lg border border-gray-300 p-2 disabled:bg-gray-100"
                            />
                          </td>
                          {kind === "sale" && (
                            <td className="p-3">
                              <select
                                aria-label={`Stock status for ${line.productName}`}
                                value={dispositions[line.id] || "RESTOCK"}
                                onChange={(event) => setDispositions((current) => ({
                                  ...current,
                                  [line.id]: event.target.value === "DAMAGED" ? "DAMAGED" : "RESTOCK",
                                }))}
                                disabled={available <= 0}
                                className="rounded-lg border border-gray-300 bg-white p-2 disabled:bg-gray-100"
                              >
                                <option value="RESTOCK">Restock</option>
                                <option value="DAMAGED">Damaged / do not restock</option>
                              </select>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Cancel</button>
                <button type="submit" disabled={saving || !locationId || reason.trim().length < 3} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                  {saving ? "Recording…" : "Record return"}
                </button>
              </div>
            </form>
          )}

          {data.returns.length ? (
            <div className="mt-5 space-y-3">
              {data.returns.map((item) => (
                <article key={item.id} className={`rounded-lg border p-4 ${item.reversedAt ? "border-gray-200 bg-gray-50 text-gray-500" : "border-gray-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.number}<span className="ml-2 text-sm font-normal">{item.reversedAt ? "Reversed" : "Posted"}</span></p>
                      <p className="mt-1 text-sm text-gray-600">{new Date(item.createdAt).toLocaleString("en-IN")} · {item.locationName} · {item.createdBy}</p>
                      <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                    </div>
                    <p className="font-semibold">{money(item.total, currency)}</p>
                  </div>
                  <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
                    {item.lines.map((line) => (
                      <li key={line.id} className="flex flex-wrap justify-between gap-2">
                        <span>{line.productName} · {line.quantity} {line.unit}{line.disposition ? ` · ${line.disposition === "RESTOCK" ? "Restocked" : "Damaged"}` : ""}</span>
                        <span>{money(line.lineTotal, currency)}</span>
                      </li>
                    ))}
                  </ul>
                  {item.reversedAt && <p className="mt-2 text-xs">Reversed {new Date(item.reversedAt).toLocaleString("en-IN")} by {item.reversedBy || "—"} · {item.reversalReason}</p>}
                  {!item.reversedAt && canManage && (
                    reversingId === item.id ? (
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3">
                        <input aria-label="Return reversal reason" required minLength={3} maxLength={500} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Reason for reversal" className="min-w-52 rounded-lg border border-gray-300 p-2 text-sm" />
                        <button type="button" onClick={() => { setReversingId(""); setReversalReason(""); }} className="text-sm text-gray-600 hover:underline">Cancel</button>
                        <button type="button" disabled={saving || reversalReason.trim().length < 3} onClick={() => submitReversal(item)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                          {saving ? "Reversing…" : "Confirm reversal"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
                        <button type="button" onClick={() => { setReversingId(item.id); setReversalReason(""); }} className="text-sm font-medium text-red-700 hover:underline">Reverse return</button>
                      </div>
                    )
                  )}
                </article>
              ))}
            </div>
          ) : <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No returns recorded yet.</p>}
        </>
      )}
    </section>
  );
}
