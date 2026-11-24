"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Product = { id: string; name: string; sku: string; baseUnit: string; materialUnit: string | null; materialUnitsPerBaseUnit: string | null; productType: string; isProcessingEnabled?: boolean };
type Location = { id: string; name: string; code: string };
type Remnant = {
  id: string; code: string; quantity: string; unit: string | null; length: string | null; width: string | null;
  status: string; createdAt: string;
  sourceOperation?: { id: string; type: string; inputQuantity: string; inputUnit: string | null; sourceRemnant: { code: string } | null; createdAt: string } | null;
  usedAsSource?: { id: string; type: string; createdAt: string }[];
  product: Product; variant: { id: string; code: string | null; attributes: Record<string, string> } | null;
  location: Location;
  movements: { id: string; type: string; quantityDelta: string; reason: string | null; createdAt: string }[];
};
async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
}
function fmt(value: string | number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(value)); }

export function RemnantManager({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Remnant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [variants, setVariants] = useState<{ id: string; code: string | null; attributes: Record<string, string> }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [sourceType, setSourceType] = useState<"STANDARD" | "REMNANT">("STANDARD");
  const [sourceRemnantId, setSourceRemnantId] = useState("");
  const [inputQuantity, setInputQuantity] = useState("");
  const [consumedQuantity, setConsumedQuantity] = useState("0");
  const [outputs, setOutputs] = useState([{ key: "output-1", quantity: "", length: "", width: "" }]);
  const [inputLength, setInputLength] = useState("");
  const [inputWidth, setInputWidth] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("AVAILABLE");
  const [destinationById, setDestinationById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<{ item: Remnant; action: "SOLD" | "CONSUMED" | "WASTED" | "TRANSFER" } | null>(null);
  const [actionQuantity, setActionQuantity] = useState("");
  const [actionReference, setActionReference] = useState("");

  const selectedProduct = products.find((item) => item.id === productId);
  const availableSourceRemnants = items.filter((item) =>
    item.status === "AVAILABLE" && item.product.id === productId &&
    item.location.id === locationId && (item.variant?.id ?? null) === (variantId || null) &&
    (item.unit ?? item.product.materialUnit ?? item.product.baseUnit) === (selectedProduct?.materialUnit ?? selectedProduct?.baseUnit)
  );
  const load = useCallback(async () => {
    const [remnants, productResponse, locationResponse] = await Promise.all([
      fetch("/api/inventory/remnants").then((r) => json<{ items: Remnant[] }>(r)),
      fetch("/api/inventory/products?active=true&page=1&pageSize=100").then((r) => json<{ items: Product[] }>(r)),
      fetch("/api/inventory/stock/locations").then((r) => json<{ items: Location[] }>(r)),
    ]);
    setItems(remnants.items);
    setProducts(productResponse.items.filter((p) => p.productType === "MATERIAL" && p.isProcessingEnabled));
    setLocations(locationResponse.items);
  }, []);
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load remnants.")); }, [load]);
  useEffect(() => {
    if (!productId) { setVariants([]); setVariantId(""); return; }
    const controller = new AbortController();
    fetch(`/api/inventory/products/${productId}/variants`, { signal: controller.signal })
      .then((response) => json<{ items: { id: string; code: string | null; attributes: Record<string, string> }[] }>(response))
      .then(({ items }) => { setVariants(items); setVariantId(""); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load variants."); });
    return () => controller.abort();
  }, [productId]);
  const availableCount = useMemo(() => items.filter((item) => item.status === "AVAILABLE").length, [items]);

  async function createProcessing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await json(await fetch("/api/inventory/remnants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId, variantId: variantId || null, locationId, sourceType,
          ...(sourceType === "REMNANT" ? { sourceRemnantId } : {}),
          inputQuantity, consumedQuantity: consumedQuantity || "0",
          outputs: outputs.filter((output) => output.quantity.trim()).map((output) => ({
            quantity: output.quantity,
            ...(output.length && output.width ? { length: output.length, width: output.width } : {}),
          })),
          ...(inputLength && inputWidth ? { inputLength, inputWidth } : {}),
          reason, idempotencyKey: crypto.randomUUID(),
        }),
      }));
      setNotice("Processing recorded. Standard stock was consumed and reusable remnant stock was created.");
      setInputQuantity(""); setConsumedQuantity("0"); setOutputs([{ key: "output-1", quantity: "", length: "", width: "" }]); setSourceRemnantId(""); setReason("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to record processing."); }
    finally { setBusy(false); }
  }

  function openAction(item: Remnant, action: "SOLD" | "CONSUMED" | "WASTED" | "TRANSFER") {
    setActionQuantity(action === "TRANSFER" ? item.quantity : "");
    setActionReference("");
    setPendingAction({ item, action });
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const { item, action } = pendingAction;
    const destinationLocationId = destinationById[item.id];
    const quantityText = action === "TRANSFER" ? item.quantity : actionQuantity.trim();
    if (action !== "TRANSFER" && quantityText && (!Number.isFinite(Number(quantityText)) || Number(quantityText) <= 0 || Number(quantityText) > Number(item.quantity))) {
      setError("Enter a valid quantity not exceeding the available remnant.");
      return;
    }
    if (action === "TRANSFER" && !destinationLocationId) {
      setError("Select a destination location.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await json(await fetch(`/api/inventory/remnants/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, ...(action === "TRANSFER" ? { destinationLocationId } : {}),
          ...(quantityText ? { quantity: quantityText } : {}),
          ...(action === "SOLD" && actionReference.trim() ? { reference: actionReference.trim() } : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      }));
      setPendingAction(null);
      setNotice(action === "SOLD" ? "Remnant marked sold in inventory. This action does not generate a sales invoice." : `Remnant ${action.toLowerCase()} recorded.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update remnant."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction ? ({ SOLD: "Mark remnant as sold", CONSUMED: "Consume remnant", WASTED: "Mark remnant as waste", TRANSFER: "Transfer remnant" }[pendingAction.action]) : "Confirm action"}
        description={pendingAction ? `${pendingAction.item.code} · ${pendingAction.item.product.name} · Available: ${fmt(pendingAction.item.quantity)} ${pendingAction.item.unit ?? pendingAction.item.product.baseUnit}${pendingAction.action === "SOLD" ? ". This records an inventory disposition only; it does not create a sales invoice." : ""}` : ""}
        confirmLabel={pendingAction ? ({ SOLD: "Mark sold", CONSUMED: "Consume", WASTED: "Mark waste", TRANSFER: "Transfer" }[pendingAction.action]) : "Confirm"}
        destructive={pendingAction?.action === "WASTED"}
        busy={busy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void confirmAction()}
      >
        {pendingAction && pendingAction.action !== "TRANSFER" && <label className="block text-sm font-medium">Quantity (leave blank to use all)
          <input type="number" min="0.0001" max={pendingAction.item.quantity} step="0.0001" value={actionQuantity} onChange={(event) => setActionQuantity(event.target.value)} placeholder={pendingAction.item.quantity} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>}
        {pendingAction?.action === "SOLD" && <label className="mt-3 block text-sm font-medium">Sale / invoice reference (optional)
          <input maxLength={100} value={actionReference} onChange={(event) => setActionReference(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>}
        {pendingAction?.action === "TRANSFER" && <p className="text-sm text-gray-600">Destination: {locations.find((location) => location.id === destinationById[pendingAction.item.id])?.name ?? "Not selected"}</p>}
      </ConfirmDialog>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Remnant records</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Available</p><p className="mt-1 text-2xl font-semibold">{availableCount}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Other statuses</p><p className="mt-1 text-2xl font-semibold">{items.length - availableCount}</p></div>
      </div>

      {canManage && <form onSubmit={createProcessing} className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Record material processing</h2>
        <p className="mb-4 mt-1 text-sm text-gray-600">Process regular stock or an existing remnant. Record consumed quantity, multiple reusable outputs and calculated waste. Every output receives its own traceable remnant record.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm">Material product<select required value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(""); setSourceRemnantId(""); setInputQuantity(""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
          {variants.length > 0 && <label className="text-sm">Variant<select required value={variantId} onChange={(e) => { setVariantId(e.target.value); setSourceRemnantId(""); setInputQuantity(""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select variant</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.code ?? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", ")}</option>)}</select></label>}
          <label className="text-sm">Location<select required value={locationId} onChange={(e) => { setLocationId(e.target.value); setSourceRemnantId(""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="text-sm">Source stock<select value={sourceType} onChange={(e) => { setSourceType(e.target.value as "STANDARD" | "REMNANT"); setSourceRemnantId(""); setInputQuantity(""); }} className="mt-1 w-full rounded-lg border p-2"><option value="STANDARD">Regular stock</option><option value="REMNANT">Existing remnant</option></select></label>
          {sourceType === "REMNANT" && <label className="text-sm md:col-span-2">Remnant to process<select required value={sourceRemnantId} onChange={(e) => { setSourceRemnantId(e.target.value); const selected = availableSourceRemnants.find((item) => item.id === e.target.value); setInputQuantity(selected?.quantity ?? ""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select available remnant</option>{availableSourceRemnants.map((item) => <option key={item.id} value={item.id}>{item.code} · {fmt(item.quantity)} {item.unit ?? selectedProduct?.materialUnit ?? selectedProduct?.baseUnit} · {item.location.name}</option>)}</select></label>}
          <label className="text-sm">{sourceType === "STANDARD" ? "Regular stock to open (" + (selectedProduct?.baseUnit ?? "unit") + ")" : "Remnant quantity to process (" + (selectedProduct?.materialUnit ?? selectedProduct?.baseUnit ?? "unit") + ")"}<input required type="number" min="0.0001" step={sourceType === "STANDARD" && selectedProduct?.materialUnitsPerBaseUnit ? "1" : "0.0001"} max={sourceType === "REMNANT" ? availableSourceRemnants.find((item) => item.id === sourceRemnantId)?.quantity : undefined} readOnly={sourceType === "REMNANT"} value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /><span className="text-xs text-gray-500">{sourceType === "STANDARD" ? "Regular stock is deducted in the base stock unit." : "The selected remnant is processed as a separate source."}</span></label>
          <label className="text-sm">Consumed / used quantity ({selectedProduct?.materialUnit ?? selectedProduct?.baseUnit ?? "unit"})<input required type="number" min="0" step="0.0001" value={consumedQuantity} onChange={(e) => setConsumedQuantity(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /><span className="text-xs text-gray-500">Quantity allocated to a job or otherwise used.</span></label>
          <div className="space-y-3 md:col-span-2 xl:col-span-3">
            <div className="flex items-center justify-between"><p className="text-sm font-medium">Reusable outputs ({selectedProduct?.materialUnit ?? selectedProduct?.baseUnit ?? "unit"})</p><button type="button" onClick={() => setOutputs((current) => [...current, { key: "output-" + (current.length + 1) + "-" + Date.now(), quantity: "", length: "", width: "" }])} className="rounded border px-3 py-1.5 text-xs">Add another remnant</button></div>
            {outputs.map((output, index) => <div key={output.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
              <label className="text-sm">Output {index + 1} quantity<input type="number" min="0.0001" step="0.0001" value={output.quantity} onChange={(e) => setOutputs((current) => current.map((item) => item.key === output.key ? { ...item, quantity: e.target.value } : item))} className="mt-1 w-full rounded border p-2" /></label>
              <label className="text-sm">Length (optional)<input type="number" min="0.0001" step="0.0001" value={output.length} onChange={(e) => setOutputs((current) => current.map((item) => item.key === output.key ? { ...item, length: e.target.value } : item))} className="mt-1 w-full rounded border p-2" /></label>
              <label className="text-sm">Width (optional)<input type="number" min="0.0001" step="0.0001" value={output.width} onChange={(e) => setOutputs((current) => current.map((item) => item.key === output.key ? { ...item, width: e.target.value } : item))} className="mt-1 w-full rounded border p-2" /></label>
              <div className="flex items-end"><button type="button" disabled={outputs.length === 1} onClick={() => setOutputs((current) => current.filter((item) => item.key !== output.key))} className="rounded border px-3 py-2 text-xs disabled:opacity-40">Remove output</button></div>
            </div>)}
            <p className="text-xs text-gray-500">Leave an output quantity blank when no reusable remnant is produced. Waste is calculated from input minus consumed and reusable outputs.</p>
          </div>
          <label className="text-sm">Input length (optional)<input type="number" min="0.0001" step="0.0001" value={inputLength} onChange={(e) => setInputLength(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Input width (optional)<input type="number" min="0.0001" step="0.0001" value={inputWidth} onChange={(e) => setInputWidth(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm md:col-span-2">Reason / job reference<input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
        </div>
        <button disabled={busy || !productId || !locationId} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Record processing"}</button>
      </form>}

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-5"><h2 className="text-lg font-semibold">Remnant register</h2><p className="mt-1 text-sm text-gray-500">Each remnant is individually identified; its stock quantity is also reflected in the REMNANT stock ledger.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Code / Product</th><th className="p-3">Quantity</th><th className="p-3">Dimensions</th><th className="p-3">Location</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody className="divide-y">
              {items.map((item) => <tr key={item.id}>
                <td className="p-3"><p className="font-medium">{item.code}</p><p>{item.product.name} · {item.product.sku}</p>{item.variant?.code && <p className="text-xs text-gray-500">{item.variant.code}</p>}{item.sourceOperation && <p className="text-xs text-gray-500">From: {item.sourceOperation.sourceRemnant?.code ?? "Regular stock"} · {item.sourceOperation.type}</p>}{Boolean(item.usedAsSource?.length) && <p className="text-xs text-amber-700">Reprocessed {item.usedAsSource!.length} time(s)</p>}</td>
                <td className="p-3 tabular-nums">{fmt(item.quantity)} {item.unit ?? item.product.baseUnit}</td>
                <td className="p-3 text-gray-600">{item.length && item.width ? `${fmt(item.length)} × ${fmt(item.width)}` : "—"}</td>
                <td className="p-3">{item.location.name}</td>
                <td className="p-3"><span className={item.status === "AVAILABLE" ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-gray-100 px-2 py-1 text-gray-600"}>{item.status}</span></td>
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  {canManage && item.status === "AVAILABLE" && <>
                    <button disabled={busy} onClick={() => openAction(item, "SOLD")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Mark sold</button>
                    <button disabled={busy} onClick={() => openAction(item, "CONSUMED")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Consume</button>
                    <button disabled={busy} onClick={() => openAction(item, "WASTED")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Waste</button>
                    <select aria-label={`Transfer destination for ${item.code}`} value={destinationById[item.id] ?? ""} onChange={(e) => setDestinationById((current) => ({ ...current, [item.id]: e.target.value }))} className="max-w-36 rounded border px-2 py-1 text-xs"><option value="">Transfer to…</option>{locations.filter((l) => l.id !== item.location.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    <button disabled={busy || !destinationById[item.id]} onClick={() => openAction(item, "TRANSFER")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Transfer</button>
                  </>}
                </div></td>
              </tr>)}
              {!items.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No material remnants recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
