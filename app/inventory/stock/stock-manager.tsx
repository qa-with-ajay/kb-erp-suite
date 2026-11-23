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
type SuccessNotice = {
  title: string;
  description: string;
  balanceLines: string[];
  movementId: string;
  note?: string;
};

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
  const [balanceLocationId, setBalanceLocationId] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [type, setType] = useState("INWARD");
  const [adjustmentDirection, setAdjustmentDirection] = useState("INCREASE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [inwardReason, setInwardReason] = useState("");
  const [inwardReasonDetails, setInwardReasonDetails] = useState("");
  const [adjustmentReasonDetails, setAdjustmentReasonDetails] = useState("");
  const [availableStock, setAvailableStock] = useState<string | null>(null);
  const [destinationStock, setDestinationStock] = useState<string | null>(null);
  const [transferReasonDetails, setTransferReasonDetails] = useState("");
  const [stockLookupLoading, setStockLookupLoading] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessNotice | null>(null);

  const loadBalances = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({ search: balanceSearch, page: String(balancePage), pageSize: String(pageSize), ...(balanceLocationId ? { locationId: balanceLocationId } : {}) });
    const response = await fetch(`/api/inventory/stock?${query}`, { signal });
    setBalances(await readJson<PageResponse<Balance>>(response));
  }, [balanceLocationId, balancePage, balanceSearch]);

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

  useEffect(() => {
    const isTransfer = type === "TRANSFER";
    const stockLocationId = isTransfer ? sourceLocationId : locationId;
    if ((!isTransfer && type !== "OUTWARD" && type !== "ADJUSTMENT") || !productId || !stockLocationId || (variants.length > 0 && !variantId) || (isTransfer && !destinationLocationId)) {
      setAvailableStock(null);
      setDestinationStock(null);
      setStockLookupLoading(false);
      return;
    }
    const selectedProduct = products.find((item) => item.id === productId);
    if (!selectedProduct) {
      setAvailableStock(null);
      return;
    }
    const controller = new AbortController();
    setAvailableStock(null);
    setDestinationStock(null);
    setStockLookupLoading(true);
    const makeStockUrl = (targetLocationId: string) => {
      const query = new URLSearchParams({ search: selectedProduct.sku, page: "1", pageSize: "100", locationId: targetLocationId });
      return `/api/inventory/stock?${query}`;
    };
    const sourceUrl = makeStockUrl(stockLocationId);
    const lookup = isTransfer
      ? Promise.all([
          fetch(sourceUrl, { signal: controller.signal }).then((response) => readJson<PageResponse<Balance>>(response)),
          fetch(makeStockUrl(destinationLocationId), { signal: controller.signal }).then((response) => readJson<PageResponse<Balance>>(response)),
        ])
      : fetch(sourceUrl, { signal: controller.signal }).then((response) => readJson<PageResponse<Balance>>(response));

    lookup
      .then((result) => {
        const sourceData = isTransfer
          ? (result as [PageResponse<Balance>, PageResponse<Balance>])[0]
          : result as PageResponse<Balance>;
        const balance = sourceData.items.find((item) => item.product.id === productId && (item.variant?.id ?? null) === (variantId || null) && item.location.id === stockLocationId);
        setAvailableStock(balance?.quantity ?? "0");
        if (isTransfer) {
          const destinationData = (result as [PageResponse<Balance>, PageResponse<Balance>])[1];
          const destinationBalance = destinationData.items.find((item) => item.product.id === productId && (item.variant?.id ?? null) === (variantId || null) && item.location.id === destinationLocationId);
          setDestinationStock(destinationBalance?.quantity ?? "0");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to check available stock.");
      })
      .finally(() => { if (!controller.signal.aborted) setStockLookupLoading(false); });
    return () => controller.abort();
  }, [type, productId, locationId, sourceLocationId, destinationLocationId, variantId, variants.length, products]);

  function invalidateRequestKey() {
    setRequestKey("");
    setSuccess("");
  }

  async function handleBarcodeScan(code: string) {
    try {
      const scanLocationId = type === "TRANSFER" ? sourceLocationId : locationId;
      const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(code)}${scanLocationId ? `&locationId=${encodeURIComponent(scanLocationId)}` : ""}`);
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
    const selectedProduct = products.find((item) => item.id === productId);
    const selectedLocation = locations.find((item) => item.id === locationId);
    const selectedSource = locations.find((item) => item.id === sourceLocationId);
    const selectedDestination = locations.find((item) => item.id === destinationLocationId);
    const quantityLabel = `${formatQuantity(quantity)} ${selectedProduct?.baseUnit ?? "units"}`;
    const inwardValue = Number(quantity) * Number(unitCost);
    if (type === "OUTWARD" || (type === "ADJUSTMENT" && adjustmentDirection === "DECREASE")) {
      if (availableStock === null || stockLookupLoading) {
        setError("Wait for the current stock quantity to load before recording this movement.");
        return;
      }
      if (Number(quantity) > Number(availableStock)) {
        setError(`Insufficient stock. Available: ${formatQuantity(availableStock)} ${selectedProduct?.baseUnit ?? "units"}.`);
        return;
      }
    }
    if (type === "TRANSFER" && (!reason.trim() || (reason === "Other" && !transferReasonDetails.trim()))) {
      setError("Choose a transfer reason and provide details when selecting Other.");
      return;
    }
    if (type === "TRANSFER" && (availableStock === null || destinationStock === null || stockLookupLoading)) {
      setError("Wait for source and destination stock quantities to load before recording this transfer.");
      return;
    }
    if (type === "TRANSFER" && Number(quantity) > Number(availableStock)) {
      setError("Insufficient source stock. Available: " + formatQuantity(availableStock ?? "0") + " " + (selectedProduct?.baseUnit ?? "units") + ".");
      return;
    }
    if (type === "ADJUSTMENT" && (!reason.trim() || (reason === "Other" && !adjustmentReasonDetails.trim()))) {
      setError("Choose an adjustment reason and provide details when selecting Other.");
      return;
    }
    const confirmationLines = [
      `Confirm ${type === "INWARD" ? "stock inward" : type === "OUTWARD" ? "stock outward" : type === "TRANSFER" ? "stock transfer" : `stock adjustment (${adjustmentDirection.toLowerCase()})`}?`,
      `Product: ${selectedProduct?.name ?? "Selected product"} (${selectedProduct?.sku ?? "—"})`,
      variants.find((item) => item.id === variantId) ? `Variant: ${variantLabel(variants.find((item) => item.id === variantId) ?? null)}` : null,
      type === "TRANSFER" ? `From: ${selectedSource?.name ?? "—"} → To: ${selectedDestination?.name ?? "—"}` : `Location: ${selectedLocation?.name ?? "—"}`,
      `Quantity: ${quantityLabel}`,
      type === "TRANSFER"
        ? "Source stock before: " + formatQuantity(availableStock ?? "0") + " " + (selectedProduct?.baseUnit ?? "") + "; after: " + formatQuantity(String(Number(availableStock ?? "0") - Number(quantity)))
        : type === "OUTWARD" || type === "ADJUSTMENT"
          ? `Current stock: ${formatQuantity(availableStock ?? "0")} ${selectedProduct?.baseUnit ?? ""}`
          : null,
      type === "TRANSFER"
        ? "Destination stock before: " + formatQuantity(destinationStock ?? "0") + " " + (selectedProduct?.baseUnit ?? "") + "; after: " + formatQuantity(String(Number(destinationStock ?? "0") + Number(quantity)))
        : null,
      type === "OUTWARD" || type === "ADJUSTMENT"
        ? `Estimated resulting stock: ${formatQuantity(String(Number(availableStock ?? "0") + (type === "ADJUSTMENT" && adjustmentDirection === "INCREASE" ? Number(quantity) : -Number(quantity))))} ${selectedProduct?.baseUnit ?? ""}`
        : null,
      type === "INWARD" || (type === "ADJUSTMENT" && adjustmentDirection === "INCREASE")
        ? `Unit cost: ₹${Number(unitCost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
        : null,
      type === "ADJUSTMENT" && adjustmentDirection === "INCREASE"
        ? `Estimated adjustment value: ₹${(Number(quantity) * Number(unitCost)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null,
      type === "INWARD"
        ? `Total inward value: ₹${inwardValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null,
      reference.trim() ? `Reference: ${reference.trim()}` : null,
      type === "INWARD" ? (inwardReason === "Other" ? inwardReasonDetails.trim() : inwardReason) :
        type === "ADJUSTMENT" ? (reason === "Other" ? adjustmentReasonDetails.trim() : reason.trim()) :
        type === "TRANSFER" ? (reason === "Other" ? transferReasonDetails.trim() : reason.trim()) : reason.trim(),
    ].filter(Boolean);
    if (!window.confirm(confirmationLines.join("\\n"))) return;
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
          ...(type === "TRANSFER" ? { sourceLocationId, destinationLocationId } : { locationId }),
          productId,
          variantId: variantId || null,
          quantity,
          adjustmentDirection: type === "ADJUSTMENT" ? adjustmentDirection : undefined,
          unitCost: type === "OUTWARD" || type === "TRANSFER" || (type === "ADJUSTMENT" && adjustmentDirection === "DECREASE") ? undefined : unitCost,
          reference,
          reason: type === "INWARD"
            ? (inwardReason === "Other" ? inwardReasonDetails.trim() : inwardReason || null)
            : type === "ADJUSTMENT"
              ? (reason === "Other" ? adjustmentReasonDetails.trim() : reason)
              : type === "TRANSFER"
                ? (reason === "Other" ? transferReasonDetails.trim() : reason)
                : reason,
          idempotencyKey: key,
        }),
      });
      const result = await readJson<{ movementId: string; replayed: boolean }>(response);
      try {
        const targetLocationIds = type === "TRANSFER" ? [sourceLocationId, destinationLocationId] : [locationId];
        const stockResponses = await Promise.all(targetLocationIds.map(async (targetLocationId) => {
          const stockQuery = new URLSearchParams({ search: selectedProduct?.sku ?? "", page: "1", pageSize: "100", locationId: targetLocationId });
          const stockResponse = await fetch(`/api/inventory/stock?${stockQuery}`);
          return readJson<PageResponse<Balance>>(stockResponse);
        }));
        const matchingBalance = (targetLocationId: string, data: PageResponse<Balance>) => data.items.find((item) =>
          item.product.id === productId &&
          (item.variant?.id ?? null) === (variantId || null) &&
          item.location.id === targetLocationId
        );
        const unit = selectedProduct?.baseUnit ?? "units";
        const quantityText = `${formatQuantity(quantity)} ${unit}`;
        const title = type === "TRANSFER" ? "Stock transferred successfully"
          : type === "INWARD" ? "Stock inward recorded"
          : type === "OUTWARD" ? "Stock outward recorded"
          : "Stock adjustment recorded";
        const description = type === "TRANSFER"
          ? `${quantityText} transferred from ${selectedSource?.name ?? "source"} to ${selectedDestination?.name ?? "destination"}.`
          : type === "INWARD" ? `${quantityText} added at ${selectedLocation?.name ?? "location"}.`
          : type === "OUTWARD" ? `${quantityText} issued from ${selectedLocation?.name ?? "location"}.`
          : `${quantityText} ${adjustmentDirection === "INCREASE" ? "added to" : "removed from"} stock at ${selectedLocation?.name ?? "location"}.`;
        const balanceLines = type === "TRANSFER"
          ? [
              `Source remaining: ${formatQuantity(matchingBalance(sourceLocationId, stockResponses[0])?.quantity ?? "0")} ${unit}`,
              `Destination now: ${formatQuantity(matchingBalance(destinationLocationId, stockResponses[1])?.quantity ?? "0")} ${unit}`,
            ]
          : [`Available at ${selectedLocation?.name ?? "location"}: ${formatQuantity(matchingBalance(locationId, stockResponses[0])?.quantity ?? "0")} ${unit}`];
        setSuccess({ title, description, balanceLines, movementId: result.movementId, ...(result.replayed ? { note: "This was a safely replayed request; no duplicate movement was created." } : {}) });
      } catch {
        setSuccess({
          title: type === "TRANSFER" ? "Stock transfer recorded" : "Stock movement recorded",
          description: `${formatQuantity(quantity)} ${selectedProduct?.baseUnit ?? "units"} processed successfully.`,
          balanceLines: [],
          movementId: result.movementId,
          note: "The latest balance could not be loaded. Refresh the stock list to verify the updated quantity.",
        });
      }
      setQuantity("");
      setReference("");
      setReason("");
      setAdjustmentReasonDetails("");
      setTransferReasonDetails("");
      setInwardReason("");
      setInwardReasonDetails("");
      setAvailableStock(null);
      setDestinationStock(null);
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
      {success && (
        <section role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 font-bold text-emerald-700">✓</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{success.title}</p>
              <p className="mt-1">{success.description}</p>
              {success.balanceLines.length > 0 && (
                <div className="mt-3 space-y-1">
                  {success.balanceLines.map((line) => <p key={line} className="font-medium">{line}</p>)}
                </div>
              )}
              {success.note && <p className="mt-2 text-emerald-800">{success.note}</p>}
              <details className="mt-3 text-xs text-emerald-800">
                <summary className="w-fit cursor-pointer select-none">Movement reference</summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="break-all">{success.movementId}</code>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(success.movementId); }} className="rounded border border-emerald-300 px-2 py-1 font-medium hover:bg-emerald-100">
                    Copy reference
                  </button>
                </div>
              </details>
            </div>
          </div>
        </section>
      )}

      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Stock Transactions</h2>
          <p className="mt-1 text-sm text-gray-600">Quantities are entered in the product’s base unit. Every entry is recorded in the stock ledger.</p>
          <form onSubmit={submitMovement} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2 xl:col-span-4"><BarcodeScanner compact autoFocus={false} onScan={handleBarcodeScan} placeholder="Scan product to select it for stock management" /></div>
            <label className="text-sm font-medium">
              Movement type
              <select value={type} onChange={(event) => { setType(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="INWARD">Stock inward</option>
                <option value="OUTWARD">Stock outward</option>
                <option value="ADJUSTMENT">Stock adjustment</option>
                <option value="TRANSFER">Stock transfer</option>
              </select>
            </label>
            {type === "TRANSFER" ? (
              <>
                <label className="text-sm font-medium">
                  From location
                  <select required value={sourceLocationId} onChange={(event) => { const nextSource = event.target.value; setSourceLocationId(nextSource); if (nextSource === destinationLocationId) setDestinationLocationId(locations.find((item) => item.id !== nextSource)?.id ?? ""); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select source</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  To location
                  <select required value={destinationLocationId} onChange={(event) => { setDestinationLocationId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select destination</option>
                    {locations.filter((location) => location.id !== sourceLocationId).map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </label>
              </>
            ) : (
              <label className="text-sm font-medium">
                Location
                <select required value={locationId} onChange={(event) => { setLocationId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="">Select a location</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </select>
              </label>
            )}
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
            {type === "TRANSFER" && productId && sourceLocationId && destinationLocationId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm sm:col-span-2 xl:col-span-4">
                <div className="font-medium">Transfer stock availability</div>
                {stockLookupLoading ? "Checking source and destination…" : availableStock === null || destinationStock === null ? "Unable to determine transfer balances" : (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <span>{locations.find((item) => item.id === sourceLocationId)?.name}: {formatQuantity(availableStock)} {products.find((item) => item.id === productId)?.baseUnit ?? "units"}</span>
                    <span>{locations.find((item) => item.id === destinationLocationId)?.name}: {formatQuantity(destinationStock)} {products.find((item) => item.id === productId)?.baseUnit ?? "units"}</span>
                  </div>
                )}
              </div>
            )}
            {(type === "OUTWARD" || type === "ADJUSTMENT") && productId && locationId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm sm:col-span-2">
                <span className="font-medium">{type === "ADJUSTMENT" ? "Current stock at this location: " : "Available stock: "}</span>
                {stockLookupLoading ? "Checking…" : availableStock === null ? "Unable to determine stock" : `${formatQuantity(availableStock)} ${products.find((item) => item.id === productId)?.baseUnit ?? "units"}`}
              </div>
            )}
            <label className="text-sm font-medium">
              Quantity
              <input required type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => { setQuantity(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            {(type === "TRANSFER" || type === "OUTWARD" || (type === "ADJUSTMENT" && adjustmentDirection === "DECREASE")) && availableStock !== null && quantity && Number(quantity) > Number(availableStock) && (
              <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">
                Insufficient stock at the selected source: requested {formatQuantity(quantity)} {products.find((item) => item.id === productId)?.baseUnit ?? "units"}, but only {formatQuantity(availableStock)} is available.
              </p>
            )}
            {type !== "OUTWARD" && type !== "TRANSFER" && !(type === "ADJUSTMENT" && adjustmentDirection === "DECREASE") && (
              <label className="text-sm font-medium">
                Unit cost
                <input required type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => { setUnitCost(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
              </label>
            )}
            <label className="text-sm font-medium">
              Reference
              <input maxLength={100} value={reference} onChange={(event) => { setReference(event.target.value); invalidateRequestKey(); }} placeholder="Optional reference" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            {type === "INWARD" ? (
              <>
                <label className="text-sm font-medium">
                  Inward reason (optional)
                  <select value={inwardReason} onChange={(event) => { setInwardReason(event.target.value); setInwardReasonDetails(""); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select reason</option>
                    <option value="Supplier Purchase">Supplier Purchase</option>
                    <option value="Opening Inventory">Opening Inventory</option>
                    <option value="Customer Return">Customer Return</option>
                    <option value="Stock Received">Stock Received</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                {inwardReason === "Other" && (
                  <label className="text-sm font-medium sm:col-span-2">
                    Specify reason (optional)
                    <input maxLength={500} value={inwardReasonDetails} onChange={(event) => { setInwardReasonDetails(event.target.value); invalidateRequestKey(); }} placeholder="Enter inward reason" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                  </label>
                )}
              </>
            ) : type === "OUTWARD" ? (
              <label className="text-sm font-medium">
                Outward reason (optional)
                <select value={reason} onChange={(event) => { setReason(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="">Select reason</option>
                  <option value="Customer Sale">Customer Sale</option>
                  <option value="Internal Use">Internal Use</option>
                  <option value="Damaged / Wastage">Damaged / Wastage</option>
                  <option value="Sample / Demonstration">Sample / Demonstration</option>
                  <option value="Return to Supplier">Return to Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            ) : type === "TRANSFER" ? (
              <>
                <label className="text-sm font-medium">
                  Transfer reason <span className="text-red-700">*</span>
                  <select required value={reason} onChange={(event) => { setReason(event.target.value); setTransferReasonDetails(""); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select reason</option>
                    <option value="Warehouse replenishment">Warehouse replenishment</option>
                    <option value="Showroom replenishment">Showroom replenishment</option>
                    <option value="Inter-location relocation">Inter-location relocation</option>
                    <option value="Project / site allocation">Project / site allocation</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                {reason === "Other" && (
                  <label className="text-sm font-medium sm:col-span-2">
                    Specify transfer reason <span className="text-red-700">*</span>
                    <input required maxLength={500} value={transferReasonDetails} onChange={(event) => { setTransferReasonDetails(event.target.value); invalidateRequestKey(); }} placeholder="Explain why stock is being transferred" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                  </label>
                )}
              </>
            ) : type === "ADJUSTMENT" ? (
              <>
                <label className="text-sm font-medium">
                  Adjustment reason <span className="text-red-700">*</span>
                  <select required value={reason} onChange={(event) => { setReason(event.target.value); setAdjustmentReasonDetails(""); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                    <option value="">Select reason</option>
                    {adjustmentDirection === "INCREASE" ? (
                      <>
                        <option value="Physical Stock Count – Excess">Physical Stock Count – Excess</option>
                        <option value="Found / Recovered Stock">Found / Recovered Stock</option>
                        <option value="Previous Entry Correction">Previous Entry Correction</option>
                      </>
                    ) : (
                      <>
                        <option value="Physical Stock Count – Shortage">Physical Stock Count – Shortage</option>
                        <option value="Damaged / Wastage">Damaged / Wastage</option>
                        <option value="Lost / Missing">Lost / Missing</option>
                        <option value="Internal Consumption">Internal Consumption</option>
                      </>
                    )}
                    <option value="Other">Other</option>
                  </select>
                </label>
                {reason === "Other" && (
                  <label className="text-sm font-medium sm:col-span-2">
                    Specify adjustment reason <span className="text-red-700">*</span>
                    <input required maxLength={500} value={adjustmentReasonDetails} onChange={(event) => { setAdjustmentReasonDetails(event.target.value); invalidateRequestKey(); }} placeholder="Explain the stock adjustment" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                  </label>
                )}
              </>
            ) : (
              <label className="text-sm font-medium sm:col-span-2">
                Reason
                <input maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); invalidateRequestKey(); }} placeholder="Optional note" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
              </label>
            )}
            <div className="flex items-end">
              <button disabled={saving || !locations.length || !productId || (type === "OUTWARD" && (stockLookupLoading || availableStock === null || !quantity || Number(quantity) > Number(availableStock))) || (type === "ADJUSTMENT" && (!reason || (reason === "Other" && !adjustmentReasonDetails.trim()) || ((adjustmentDirection === "DECREASE") && (stockLookupLoading || availableStock === null || !quantity || Number(quantity) > Number(availableStock))))) || (type === "TRANSFER" && (!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId || !reason || (reason === "Other" && !transferReasonDetails.trim()) || stockLookupLoading || availableStock === null || destinationStock === null || !quantity || Number(quantity) <= 0 || Number(quantity) > Number(availableStock)))} className="w-full rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
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
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium">
              Location
              <select value={balanceLocationId} onChange={(event) => { setBalanceLocationId(event.target.value); setBalancePage(1); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="">All locations</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Search
              <input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }} placeholder="Product or SKU" className="mt-1 block rounded-lg border border-gray-300 p-2.5" />
            </label>
          </div>
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
                    <td className="py-3 pr-4">{movement.type === "TRANSFER" ? `${movement.ledgerEntries.find((item) => Number(item.quantityDelta) < 0)?.location.name ?? "—"} → ${movement.ledgerEntries.find((item) => Number(item.quantityDelta) > 0)?.location.name ?? "—"}` : entry.location.name}</td>
                    <td className={`py-3 pr-4 font-medium ${Number(entry.quantityDelta) < 0 ? "text-red-700" : "text-emerald-800"}`}>
                      {movement.type === "TRANSFER" ? `${formatQuantity(movement.ledgerEntries.find((item) => Number(item.quantityDelta) > 0)?.quantityDelta ?? "0")} ${entry.product.baseUnit} transferred` : `${Number(entry.quantityDelta) > 0 ? "+" : ""}${formatQuantity(entry.quantityDelta)} ${entry.product.baseUnit}`}
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
