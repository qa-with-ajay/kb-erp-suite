"use client";

import { useCallback, useEffect, useState } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";

type ProductOption = { id: string; name: string; sku: string; baseUnit: string };
type VariantOption = { id: string; code: string | null; attributes: Record<string, string>; isActive?: boolean };
type LocationOption = { id: string; name: string; code: string };
type Balance = {
  id: string;
  quantity: string;
  averageCost: string;
  updatedAt: string;
  product: { id: string; name: string; sku: string; baseUnit: string; minimumStock: string };
  variant: VariantOption | null;
  location: { id: string; name: string; code: string };
};
type LedgerEntry = {
  id: string;
  quantityDelta: string;
  unitCost: string;
  product: ProductOption;
  variant: VariantOption | null;
  location: LocationOption;
};
type Movement = {
  id: string;
  type: string;
  reference: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string };
  ledgerEntries: LedgerEntry[];
};
type PageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

const pageSize = 20;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  return body as T;
}

function formatQuantity(value: string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(value));
}

function variantLabel(variant: VariantOption | null) {
  if (!variant) return "—";
  const attributes = Object.entries(variant.attributes).map(([key, value]) => `${key}: ${value}`).join(", ");
  return [variant.code, attributes].filter(Boolean).join(" · ");
}

export function StockManager({ canManage }: { canManage: boolean }) {
  const [balances, setBalances] = useState<PageResponse<Balance>>({ items: [], total: 0, page: 1, pageSize });
  const [movements, setMovements] = useState<PageResponse<Movement>>({ items: [], total: 0, page: 1, pageSize });
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [type, setType] = useState("INWARD");
  const [adjustmentDirection, setAdjustmentDirection] = useState("INCREASE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBalances = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({ search: balanceSearch, page: String(balancePage), pageSize: String(pageSize) });
    const response = await fetch(`/api/inventory/stock?${query}`, { signal });
    setBalances(await readJson<PageResponse<Balance>>(response));
  }, [balancePage, balanceSearch]);

  const loadMovements = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({ search: movementSearch, page: String(movementPage), pageSize: String(pageSize) });
    const response = await fetch(`/api/inventory/stock/movements?${query}`, { signal });
    setMovements(await readJson<PageResponse<Movement>>(response));
  }, [movementPage, movementSearch]);

  const refreshLists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadBalances(), loadMovements()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load stock data.");
    } finally {
      setLoading(false);
    }
  }, [loadBalances, loadMovements]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/inventory/stock/locations", { signal: controller.signal })
      .then((response) => readJson<{ items: LocationOption[] }>(response))
      .then(({ items }) => {
        setLocations(items);
        setLocationId((current) => current || items[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load stock locations.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ search: productSearch, active: "true", page: "1", pageSize: "20" });
      fetch(`/api/inventory/products?${query}`, { signal: controller.signal })
        .then((response) => readJson<PageResponse<ProductOption>>(response))
        .then((data) => setProducts(data.items))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to search products.");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productSearch]);

  useEffect(() => {
    if (!productId) {
      setVariants([]);
      setVariantId("");
      return;
    }
    const controller = new AbortController();
    fetch(`/api/inventory/products/${productId}/variants`, { signal: controller.signal })
      .then((response) => readJson<{ items: VariantOption[] }>(response))
      .then(({ items }) => {
        const activeItems = items.filter((variant) => variant.isActive !== false);
        setVariants(activeItems);
        setVariantId((current) => activeItems.some((variant) => variant.id === current) ? current : "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load product variants.");
      });
    return () => controller.abort();
  }, [productId]);

  function invalidateRequestKey() {
    setRequestKey("");
    setSuccess("");
  }

  async function handleBarcodeScan(code: string) {
    try {
      const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(code)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""}`);
      const body = await readJson<{ product: ProductOption; matchedVariantId: string | null }>(response);
      setProducts((current) => current.some((item) => item.id === body.product.id) ? current : [body.product, ...current]);
      setProductId(body.product.id);
      setVariantId(body.matchedVariantId ?? "");
      setQuantity((current) => current || "1");
      setUnitCost("");
      invalidateRequestKey();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to find scanned product.");
    }
  }

  async function submitMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const movementLabel = type === "ADJUSTMENT"
      ? `adjust stock ${adjustmentDirection.toLowerCase()}`
      : `record ${type.toLowerCase().replaceAll("_", " ")}`;
    if (!window.confirm(`Confirm you want to ${movementLabel} by ${quantity} for the selected product?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);
    try {
      const response = await fetch("/api/inventory/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          locationId,
          productId,
          variantId: variantId || null,
          quantity,
          adjustmentDirection: type === "ADJUSTMENT" ? adjustmentDirection : undefined,
          unitCost: type === "OUTWARD" || (type === "ADJUSTMENT" && adjustmentDirection === "DECREASE") ? undefined : unitCost,
          reference,
          reason,
          idempotencyKey: key,
        }),
      });
      await readJson<{ movementId: string; replayed: boolean }>(response);
      setSuccess("Stock transaction recorded.");
      setQuantity("");
      setReference("");
      setReason("");
      setRequestKey("");
      await refreshLists();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record stock movement.");
    } finally {
      setSaving(false);
    }
  }

  const balancePageCount = Math.max(1, Math.ceil(balances.total / pageSize));
  const movementPageCount = Math.max(1, Math.ceil(movements.total / pageSize));

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}

      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Stock Inward / Outward / Adjustment</h2>
          <p className="mt-1 text-sm text-gray-600">Quantities are entered in the product’s base unit. Every entry is recorded in the stock ledger.</p>
          <form onSubmit={submitMovement} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2 xl:col-span-4"><BarcodeScanner compact autoFocus={false} onScan={handleBarcodeScan} placeholder="Scan product to select it for stock management" /></div>
            <label className="text-sm font-medium">
              Movement type
              <select value={type} onChange={(event) => { setType(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="INWARD">Stock inward</option>
                <option value="OUTWARD">Stock outward</option>
                <option value="ADJUSTMENT">Stock adjustment</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Location
              <select required value={locationId} onChange={(event) => { setLocationId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="">Select a location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Search products
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Name or SKU" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            <label className="text-sm font-medium">
              Product
              <select required value={productId} onChange={(event) => { setProductId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="">Select a product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
              </select>
            </label>
            {variants.length > 0 && (
              <label className="text-sm font-medium">
                Variant
                <select required value={variantId} onChange={(event) => { setVariantId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="">Select a variant</option>
                  {variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>)}
                </select>
              </label>
            )}
            {type === "ADJUSTMENT" && (
              <label className="text-sm font-medium">
                Adjustment
                <select value={adjustmentDirection} onChange={(event) => { setAdjustmentDirection(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="INCREASE">Increase stock</option>
                  <option value="DECREASE">Decrease stock</option>
                </select>
              </label>
            )}
            <label className="text-sm font-medium">
              Quantity
              <input required type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => { setQuantity(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            {type !== "OUTWARD" && !(type === "ADJUSTMENT" && adjustmentDirection === "DECREASE") && (
              <label className="text-sm font-medium">
                Unit cost
                <input required type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => { setUnitCost(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
              </label>
            )}
            <label className="text-sm font-medium">
              Reference
              <input maxLength={100} value={reference} onChange={(event) => { setReference(event.target.value); invalidateRequestKey(); }} placeholder="Optional reference" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Reason {type === "ADJUSTMENT" && <span className="text-red-700">*</span>}
              <input maxLength={500} required={type === "ADJUSTMENT"} value={reason} onChange={(event) => { setReason(event.target.value); invalidateRequestKey(); }} placeholder={type === "ADJUSTMENT" ? "Required for adjustments" : type === "INWARD" ? "Initial inventory, supplier receipt, etc." : "Optional note"} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            <div className="flex items-end">
              <button disabled={saving || !locations.length || !productId} className="w-full rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {saving ? "Recording…" : "Record movement"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Current stock</h2>
            <p className="mt-1 text-sm text-gray-600">Standard inventory balances by product, variant and location.</p>
          </div>
          <label className="text-sm font-medium">
            Search
            <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder="Product or SKU" className="mt-1 block rounded-lg border border-gray-300 p-2.5" />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Variant</th><th className="py-2 pr-4">Location</th><th className="py-2 pr-4">Quantity</th><th className="py-2 pr-4">Avg. cost</th><th className="py-2">Updated</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading stock…</td></tr>
              ) : balances.items.length ? balances.items.map((balance) => (
                <tr key={balance.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4"><span className="font-medium">{balance.product.name}</span><span className="ml-2 text-xs text-gray-500">{balance.product.sku}</span></td>
                  <td className="py-3 pr-4">{variantLabel(balance.variant)}</td>
                  <td className="py-3 pr-4">{balance.location.name}</td>
                  <td className="py-3 pr-4">{formatQuantity(balance.quantity)} {balance.product.baseUnit}</td>
                  <td className="py-3 pr-4">{balance.averageCost}</td>
                  <td className="py-3">{new Date(balance.updatedAt).toLocaleDateString("en-IN")}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No stock balances recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={balancePage} pageCount={balancePageCount} loading={loading} onPage={setBalancePage} total={balances.total} label="balances" />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Stock ledger</h2>
            <p className="mt-1 text-sm text-gray-600">Immutable history for every recorded stock movement.</p>
          </div>
          <label className="text-sm font-medium">
            Search
            <input value={movementSearch} onChange={(event) => { setMovementSearch(event.target.value); setMovementPage(1); }} placeholder="Product, SKU, or reference" className="mt-1 block rounded-lg border border-gray-300 p-2.5" />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Location</th><th className="py-2 pr-4">Change</th><th className="py-2 pr-4">Unit cost</th><th className="py-2 pr-4">Reference / reason</th><th className="py-2">User</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">Loading ledger…</td></tr>
              ) : movements.items.length ? movements.items.map((movement) => {
                const entry = movement.ledgerEntries[0];
                if (!entry) return null;
                return (
                  <tr key={movement.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{new Date(movement.createdAt).toLocaleString("en-IN")}</td>
                    <td className="py-3 pr-4">{movement.type.replaceAll("_", " ")}</td>
                    <td className="py-3 pr-4"><span className="font-medium">{entry.product.name}</span><span className="ml-2 text-xs text-gray-500">{variantLabel(entry.variant)}</span></td>
                    <td className="py-3 pr-4">{entry.location.name}</td>
                    <td className={`py-3 pr-4 font-medium ${Number(entry.quantityDelta) < 0 ? "text-red-700" : "text-emerald-800"}`}>
                      {Number(entry.quantityDelta) > 0 ? "+" : ""}{formatQuantity(entry.quantityDelta)} {entry.product.baseUnit}
                    </td>
                    <td className="py-3 pr-4">{entry.unitCost}</td>
                    <td className="py-3 pr-4">{movement.reference || movement.reason || "—"}</td>
                    <td className="py-3">{movement.actor.name}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">No stock movements recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={movementPage} pageCount={movementPageCount} loading={loading} onPage={setMovementPage} total={movements.total} label="movements" />
      </section>
    </div>
  );
}

function Pagination({ page, pageCount, loading, onPage, total, label }: {
  page: number;
  pageCount: number;
  loading: boolean;
  onPage: (page: number) => void;
  total: number;
  label: string;
}) {
  return (
    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
      <span>{total} {label}</span>
      <div className="flex items-center gap-3">
        <button disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
