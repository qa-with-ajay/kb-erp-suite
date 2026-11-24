"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; sku: string; baseUnit: string; productType: string; isProcessingEnabled?: boolean };
type Location = { id: string; name: string; code: string };
type Remnant = {
  id: string; code: string; quantity: string; unit: string | null; length: string | null; width: string | null;
  status: string; createdAt: string;
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
  const [inputQuantity, setInputQuantity] = useState("");
  const [remnantQuantity, setRemnantQuantity] = useState("");
  const [inputLength, setInputLength] = useState("");
  const [inputWidth, setInputWidth] = useState("");
  const [remnantLength, setRemnantLength] = useState("");
  const [remnantWidth, setRemnantWidth] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("AVAILABLE");
  const [destinationById, setDestinationById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedProduct = products.find((item) => item.id === productId);
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
          productId, variantId: variantId || null, locationId,
          inputQuantity, remnantQuantity,
          ...(inputLength && inputWidth ? { inputLength, inputWidth } : {}),
          ...(remnantLength && remnantWidth ? { remnantLength, remnantWidth } : {}),
          reason, idempotencyKey: crypto.randomUUID(),
        }),
      }));
      setNotice("Processing recorded. Standard stock was consumed and reusable remnant stock was created.");
      setInputQuantity(""); setRemnantQuantity(""); setReason("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to record processing."); }
    finally { setBusy(false); }
  }

  async function act(item: Remnant, action: "SOLD" | "CONSUMED" | "WASTED" | "TRANSFER") {
    setBusy(true); setError(""); setNotice("");
    try {
      const destinationLocationId = destinationById[item.id];
      const reference = action === "SOLD" ? window.prompt("Sale / invoice reference (optional):") || "" : "";
      const confirmMessage = action === "SOLD" ? "Mark this remnant as sold in inventory? This does not create a sales invoice." : action === "WASTED" ? "Mark this remnant as waste?" : action === "CONSUMED" ? "Mark this remnant as consumed?" : "Transfer this remnant to the selected location?";
      if (!window.confirm(confirmMessage)) return;
      await json(await fetch(`/api/inventory/remnants/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, ...(action === "TRANSFER" ? { destinationLocationId } : {}),
          ...(action === "SOLD" ? { reference } : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      }));
      setNotice(action === "SOLD" ? "Remnant marked sold in inventory. This action does not generate a sales invoice." : `Remnant ${action.toLowerCase()} recorded.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update remnant."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Remnant records</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Available</p><p className="mt-1 text-2xl font-semibold">{availableCount}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Other statuses</p><p className="mt-1 text-2xl font-semibold">{items.length - availableCount}</p></div>
      </div>

      {canManage && <form onSubmit={createProcessing} className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Record material processing</h2>
        <p className="mb-4 mt-1 text-sm text-gray-600">Enter the quantity consumed and the reusable leftover. The difference is recorded as waste. Quantities use the product base unit.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm">Material product<select required value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(""); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
          {variants.length > 0 && <label className="text-sm">Variant<select required value={variantId} onChange={(e) => setVariantId(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Select variant</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.code ?? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", ")}</option>)}</select></label>}
          <label className="text-sm">Location<select required value={locationId} onChange={(e) => setLocationId(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Select location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="text-sm">Input quantity ({selectedProduct?.baseUnit ?? "unit"})<input required type="number" min="0.0001" step="0.0001" value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Reusable remnant quantity ({selectedProduct?.baseUnit ?? "unit"})<input required type="number" min="0" step="0.0001" value={remnantQuantity} onChange={(e) => setRemnantQuantity(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Input length (optional)<input type="number" min="0.0001" step="0.0001" value={inputLength} onChange={(e) => setInputLength(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Input width (optional)<input type="number" min="0.0001" step="0.0001" value={inputWidth} onChange={(e) => setInputWidth(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Remnant length (optional)<input type="number" min="0.0001" step="0.0001" value={remnantLength} onChange={(e) => setRemnantLength(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="text-sm">Remnant width (optional)<input type="number" min="0.0001" step="0.0001" value={remnantWidth} onChange={(e) => setRemnantWidth(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
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
                <td className="p-3"><p className="font-medium">{item.code}</p><p>{item.product.name} · {item.product.sku}</p>{item.variant?.code && <p className="text-xs text-gray-500">{item.variant.code}</p>}</td>
                <td className="p-3 tabular-nums">{fmt(item.quantity)} {item.unit ?? item.product.baseUnit}</td>
                <td className="p-3 text-gray-600">{item.length && item.width ? `${fmt(item.length)} × ${fmt(item.width)}` : "—"}</td>
                <td className="p-3">{item.location.name}</td>
                <td className="p-3"><span className={item.status === "AVAILABLE" ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-gray-100 px-2 py-1 text-gray-600"}>{item.status}</span></td>
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  {canManage && item.status === "AVAILABLE" && <>
                    <button disabled={busy} onClick={() => void act(item, "SOLD")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Mark sold</button>
                    <button disabled={busy} onClick={() => void act(item, "CONSUMED")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Consume</button>
                    <button disabled={busy} onClick={() => void act(item, "WASTED")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Waste</button>
                    <select aria-label={`Transfer destination for ${item.code}`} value={destinationById[item.id] ?? ""} onChange={(e) => setDestinationById((current) => ({ ...current, [item.id]: e.target.value }))} className="max-w-36 rounded border px-2 py-1 text-xs"><option value="">Transfer to…</option>{locations.filter((l) => l.id !== item.location.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    <button disabled={busy || !destinationById[item.id]} onClick={() => void act(item, "TRANSFER")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Transfer</button>
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
