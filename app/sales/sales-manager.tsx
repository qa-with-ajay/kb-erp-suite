"use client";

import Link from "next/link";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type CustomerOption = { id: string; name: string; phone: string | null };
type Product = {
  id: string;
  name: string;
  sku: string;
  baseUnit: string;
  materialUnit?: string | null;
  materialUnitsPerBaseUnit?: string | null;
  isProcessingEnabled: boolean;
  unitConversions?: Array<{ unit: string; conversionFactor: string; isSalesUnit?: boolean }>;
  productType: "STANDARD" | "MATERIAL";
  sellingPrice: string;
  gstPercentage: string;
  variants: Array<{ id: string; code: string | null; attributes: Record<string, string> }>;
  stockBalances: Array<{ id: string; variantId: string | null; quantity: string; averageCost?: string }>;
  materialRemnants?: Array<{ id: string; code: string; variantId: string | null; quantity: string; unit: string | null; unitCost: string }>;
};
type DraftLine = { key: string; product: Product | null; variantId: string; saleUnit: string; createRemnant: boolean; saleQuantity: string; allocations: Record<string, string> };
type SaleRow = {
  id: string;
  invoiceNumber: string;
  taxMode: "GST" | "NON_GST";
  customerName: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  returnedAmount: string;
  paidAmount: string;
  balanceDue: string;
  creditBalance: string;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "CREDIT";
  createdAt: string;
  _count: { lines: number };
};
type PageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  return body as T;
}

function money(value: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}

function variantLabel(variant: Product["variants"][number]) {
  return [variant.code, ...Object.entries(variant.attributes).map(([key, value]) => `${key}: ${value}`)]
    .filter(Boolean)
    .join(" · ");
}

function saleUnit(product: Product | null) { return product?.materialUnit ?? product?.baseUnit ?? "unit"; }
function saleUnitPrice(product: Product | null, unit: string) {
  if (!product) return 0;
  if (product.materialUnit && unit === product.materialUnit) return Number(product.sellingPrice) / Number(product.materialUnitsPerBaseUnit || 1);
  if (unit === product.baseUnit) return Number(product.sellingPrice);
  const conversion = product.unitConversions?.find((item) => item.unit === unit && item.isSalesUnit !== false);
  return conversion ? Number(product.sellingPrice) * Number(conversion.conversionFactor) : Number(product.sellingPrice);
}
function lineQuantity(line: DraftLine) {
  if (!line.product) return 0;
  const remnantQty = Object.entries(line.allocations).filter(([key]) => key.startsWith("REMNANT:")).reduce((sum, [, raw]) => sum + Number(raw || 0), 0);
  if (line.createRemnant) return Number(line.saleQuantity || 0) + remnantQty;
  const materialFactor = Number(line.product.materialUnitsPerBaseUnit || 1);
  const conversion = line.product.unitConversions?.find((item) => item.unit === line.saleUnit && item.isSalesUnit !== false);
  return Object.entries(line.allocations).reduce((sum, [key, raw]) => {
    const quantity = Number(raw || 0);
    if (key.startsWith("REMNANT:")) return sum + quantity;
    const normalized = line.product?.materialUnit && line.saleUnit === line.product.materialUnit
      ? quantity * materialFactor
      : line.saleUnit === line.product?.baseUnit ? quantity
      : conversion ? quantity / Number(conversion.conversionFactor) : quantity;
    return sum + normalized;
  }, 0);
}
function defaultAllocations(product: Product | null, variantId: string) {
  if (!product) return {};
  const balance = product.stockBalances.find((item) => item.variantId === (variantId || null) && Number(item.quantity) > 0);
  if (balance) return { [`STANDARD:${balance.id}`]: "1" };
  const remnant = (product.materialRemnants ?? []).find((item) => item.variantId === (variantId || null) && Number(item.quantity) > 0);
  return remnant ? { [`REMNANT:${remnant.id}`]: "1" } : {};
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function SalesManager({ canManage, canSelectCustomer }: { canManage: boolean; canSelectCustomer: boolean }) {
  const [sales, setSales] = useState<PageResponse<SaleRow>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locationId, setLocationId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [page, setPage] = useState(1);
  const [taxMode, setTaxMode] = useState<"GST" | "NON_GST">("GST");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ key: crypto.randomUUID(), product: null, variantId: "", saleUnit: "", createRemnant: false, saleQuantity: "", allocations: {} }]);
  const [requestKey, setRequestKey] = useState("");
  // null = "not edited": the amount follows the invoice total (full payment).
  const [amountReceived, setAmountReceived] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "OTHER">("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSaleLines, setPendingSaleLines] = useState<Array<DraftLine & { product: Product }>>([]);

  const loadSales = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({ search: saleSearch, page: String(page), pageSize: "20" });
    const response = await fetch(`/api/sales?${query}`, { signal });
    setSales(await readJson<PageResponse<SaleRow>>(response));
  }, [page, saleSearch]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadSales(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load invoices.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadSales]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sales/locations", { signal: controller.signal })
      .then((response) => readJson<{ items: Location[] }>(response))
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
    if (!canSelectCustomer) return;
    const controller = new AbortController();
    fetch("/api/customers?active=true&page=1&pageSize=100", { signal: controller.signal })
      .then((response) => readJson<{ items: CustomerOption[] }>(response))
      .then(({ items }) => setCustomers(items))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load customers.");
      });
    return () => controller.abort();
  }, [canSelectCustomer]);

  useEffect(() => {
    if (!locationId) {
      setProducts([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ locationId, search: productSearch, page: "1", pageSize: "50" });
      fetch(`/api/sales/products?${query}`, { signal: controller.signal })
        .then((response) => readJson<PageResponse<Product>>(response))
        .then((data) => setProducts(data.items))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to search saleable products.");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationId, productSearch]);

  const totals = useMemo(() => lines.reduce((result, line) => {
    if (!line.product || lineQuantity(line) <= 0) return result;
    const quantity = lineQuantity(line);
    const lineSubtotal = roundMoney(roundMoney(saleUnitPrice(line.product, line.saleUnit || saleUnit(line.product))) * quantity);
    const lineTax = taxMode === "GST"
      ? roundMoney(lineSubtotal * Number(line.product.gstPercentage) / 100)
      : 0;
    return {
      subtotal: result.subtotal + lineSubtotal,
      tax: result.tax + lineTax,
      total: result.total + lineSubtotal + lineTax,
    };
  }, { subtotal: 0, tax: 0, total: 0 }), [lines, taxMode]);

  const receivedText = amountReceived ?? totals.total.toFixed(2);
  const receivedValue = Number(receivedText);
  const dueAfterPayment = Math.max(0, roundMoney(totals.total - (Number.isFinite(receivedValue) ? receivedValue : 0)));
  const paymentInvalid =
    !/^\d+(\.\d{1,2})?$/.test(receivedText) || receivedValue > totals.total;
  const needsCustomer = dueAfterPayment > 0 && !customerId && !customerName.trim();

  function invalidateRequestKey() {
    setRequestKey("");
  }

  function updateLine(key: string, update: Partial<DraftLine>) {
    invalidateRequestKey();
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...update } : line));
  }

  async function handleBarcodeScan(code: string) {
    if (!locationId) { setError("Select a stock location before scanning products."); return; }
    try {
      const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(code)}&locationId=${encodeURIComponent(locationId)}`);
      const body = await readJson<{ product: Product; matchedVariantId: string | null }>(response);
      const product = body.product;
      const variantId = body.matchedVariantId ?? (product.variants.length === 1 ? product.variants[0].id : "");
      setProducts((current) => current.some((item) => item.id === product.id) ? current : [...current, product]);
      invalidateRequestKey();
      setLines((current) => {
        const existing = current.find((line) => line.product?.id === product.id && line.variantId === variantId);
        if (existing) {
          const sourceKey = Object.keys(existing.allocations)[0];
          return current.map((line) => line.key === existing.key && sourceKey
            ? { ...line, allocations: { ...line.allocations, [sourceKey]: String(Number(line.allocations[sourceKey] || 0) + 1) } }
            : line);
        }
        const empty = current.find((line) => !line.product);
        if (empty) return current.map((line) => line.key === empty.key ? { ...line, product, variantId, saleUnit: saleUnit(product), createRemnant: false, saleQuantity: "", allocations: defaultAllocations(product, variantId) } : line);
        return [...current, { key: crypto.randomUUID(), product, variantId, saleUnit: saleUnit(product), createRemnant: false, saleQuantity: "", allocations: defaultAllocations(product, variantId) }];
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to find scanned product.");
    }
  }

  async function submitSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const completeLines = lines.filter((line): line is DraftLine & { product: Product } => Boolean(line.product));
    if (completeLines.length !== lines.length) {
      setError("Choose a product for every invoice line.");
      return;
    }
    if (completeLines.some((line) => line.product.variants.length > 0 && !line.variantId)) {
      setError("Select a variant for each product that has variants.");
      return;
    }
    if (completeLines.some((line) => lineQuantity(line) <= 0 || !Number.isFinite(lineQuantity(line)))) {
      setError("Allocate a positive quantity from regular stock or at least one available remnant for every invoice line.");
      return;
    }
    if (paymentInvalid) {
      setError("Amount received must be a valid amount (max 2 decimals) and cannot exceed the invoice total.");
      return;
    }
    if (needsCustomer) {
      setError("Select or enter a customer to leave a balance due.");
      return;
    }
    setPendingSaleLines(completeLines);
    setConfirmOpen(true);
  }

  async function confirmSale() {
    if (!pendingSaleLines.length) return;
    setConfirmOpen(false);
    setSaving(true);
    const idempotencyKey = requestKey || crypto.randomUUID();
    setRequestKey(idempotencyKey);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          taxMode,
          customerId: customerId || null,
          customerName,
          customerPhone,
          idempotencyKey,
          payment: {
            ...(amountReceived === null ? { payInFull: true } : { amount: receivedText }),
            method: paymentMethod,
            reference: paymentReference.trim() || undefined,
          },
          lines: pendingSaleLines.map((line) => ({
            productId: line.product.id,
            variantId: line.variantId || null,
            quantity: lineQuantity(line).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""),
            saleUnit: line.saleUnit || saleUnit(line.product),
            createRemnant: line.createRemnant,
            allocations: Object.entries(line.allocations).filter(([, quantity]) => Number(quantity) > 0).map(([key, quantity]) => ({
              sourceType: key.startsWith("STANDARD:") ? "STANDARD" : "REMNANT",
              sourceId: key.split(":")[1],
              quantity,
            })),
          })),
        }),
      });
      const result = await readJson<{ saleId: string }>(response);
      window.location.assign(`/sales/${result.saleId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete the sale.");
      setSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(sales.total / sales.pageSize));

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm sale"
        description={`Confirm this sale for ${money(totals.total)}? Received ${money(receivedValue)}${dueAfterPayment > 0 ? `, balance due ${money(dueAfterPayment)}` : ""}. Stock will be deducted immediately.`}
        confirmLabel="Complete sale"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmSale()}
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create invoice</h2>
          <p className="mt-1 text-sm text-gray-600">Choose regular stock units and/or individual remnants. Material invoices use the configured measurement unit; each source is deducted separately.</p>
          <form onSubmit={submitSale} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-medium">
                Stock location
                <select required value={locationId} onChange={(event) => { setLocationId(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="">Select location</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Invoice tax mode
                <select value={taxMode} onChange={(event) => { setTaxMode(event.target.value as "GST" | "NON_GST"); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                  <option value="GST">GST invoice (GST added)</option>
                  <option value="NON_GST">Non-GST invoice</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Customer name (optional)
                <input value={customerName} maxLength={120} disabled={Boolean(customerId)} onChange={(event) => { setCustomerName(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5 disabled:bg-gray-100" />
              </label>
              <label className="text-sm font-medium">
                Customer phone (optional)
                <input value={customerPhone} maxLength={30} disabled={Boolean(customerId)} onChange={(event) => { setCustomerPhone(event.target.value); invalidateRequestKey(); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5 disabled:bg-gray-100" />
              </label>
            </div>

            {canSelectCustomer && (
              <label className="block max-w-lg text-sm font-medium">
                Customer record
                <select
                  value={customerId}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    const customer = customers.find((item) => item.id === selectedId);
                    setCustomerId(selectedId);
                    setCustomerName(customer?.name ?? "");
                    setCustomerPhone(customer?.phone ?? "");
                    invalidateRequestKey();
                  }}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5"
                >
                  <option value="">Walk-in / enter customer details</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
                </select>
              </label>
            )}

            <BarcodeScanner compact autoFocus={false} onScan={handleBarcodeScan} placeholder="Scan to add product to this invoice" />
            <label className="block max-w-lg text-sm font-medium">
              Search products with stock
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Product name or SKU" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const product = line.product;
                const selectedBalances = product?.stockBalances.filter((item) => item.variantId === (line.variantId || null)) ?? [];
                const selectedRemnants = (product?.materialRemnants ?? []).filter((item) => item.variantId === (line.variantId || null) && (item.unit ?? product?.materialUnit ?? product?.baseUnit) === (line.saleUnit || saleUnit(product)));
                const quantity = lineQuantity(line);
                return (
                  <div key={line.key} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                    <label className="text-sm font-medium">
                      Product
                      <select
                        required
                        value={line.product?.id ?? ""}
                        onChange={(event) => {
                          const product = products.find((candidate) => candidate.id === event.target.value) ?? null;
                          updateLine(line.key, { product, variantId: "", saleUnit: saleUnit(product), createRemnant: false, saleQuantity: "", allocations: defaultAllocations(product, "") });
                        }}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5"
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name} · {product.sku} · {product.baseUnit}</option>
                        ))}
                        {line.product && !products.some((product) => product.id === line.product?.id) && (
                          <option value={line.product.id}>{line.product.name} · {line.product.sku} · {line.product.baseUnit}</option>
                        )}
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Variant
                      <select
                        disabled={!line.product?.variants.length}
                        value={line.variantId}
                        onChange={(event) => updateLine(line.key, { variantId: event.target.value, allocations: defaultAllocations(product, event.target.value) })}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5 disabled:bg-gray-100"
                      >
                        <option value="">{line.product?.variants.length ? "Select variant" : "No variant"}</option>
                        {line.product?.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2 text-sm sm:col-span-2 xl:col-span-1">
                      <p className="font-semibold">Stock source allocation</p>
                      {product && <label className="block text-xs font-medium">Sales unit
                        <select value={line.saleUnit || saleUnit(product)} onChange={(event) => {
                          const nextUnit = event.target.value;
                          const nextAllocations = Object.fromEntries(Object.entries(line.allocations).filter(([key]) => {
                            if (key.startsWith("STANDARD:")) return true;
                            const remnant = selectedRemnants.find((item) => `REMNANT:${item.id}` === key);
                            return Boolean(remnant && (remnant.unit ?? product.materialUnit ?? product.baseUnit) === nextUnit);
                          }));
                          updateLine(line.key, { saleUnit: nextUnit, createRemnant: false, saleQuantity: "", allocations: nextAllocations });
                        }} className="mt-1 w-full rounded border p-2">
                          {[product.baseUnit, ...(product.materialUnit ? [product.materialUnit] : []), ...(product.unitConversions ?? []).filter((item) => item.isSalesUnit !== false).map((item) => item.unit)].filter((unit, i, all) => all.indexOf(unit) === i).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </label>}
                      {selectedBalances.map((balance) => {
                        const key = `STANDARD:${balance.id}`;
                        return <label key={key} className="block rounded-lg border border-gray-200 p-2">
                          <span className="flex justify-between gap-2"><span>Regular · {product?.baseUnit}</span><span className="text-gray-500">Available: {balance.quantity}</span></span>
                          <input type="number" min="0" step={product?.materialUnit || product?.productType === "STANDARD" ? "1" : "0.0001"} max={balance.quantity} value={line.allocations[key] ?? ""} onChange={(event) => updateLine(line.key, { allocations: { ...line.allocations, [key]: event.target.value } })} placeholder="Quantity to take" className="mt-1 w-full rounded border p-2" />
                        </label>;
                      })}
                      {selectedRemnants.map((remnant) => {
                        const key = `REMNANT:${remnant.id}`;
                        return <label key={key} className="block rounded-lg border border-emerald-200 p-2">
                          <span className="flex justify-between gap-2"><span>Remnant · {remnant.code}</span><span className="text-gray-500">Available: {remnant.quantity} {remnant.unit ?? saleUnit(product)}</span></span>
                          <input type="number" min="0" step="0.0001" max={remnant.quantity} value={line.allocations[key] ?? ""} onChange={(event) => updateLine(line.key, { allocations: { ...line.allocations, [key]: event.target.value } })} placeholder={`Quantity in ${remnant.unit ?? saleUnit(product)}`} className="mt-1 w-full rounded border p-2" />
                        </label>;
                      })}
                      {product?.isProcessingEnabled && product.materialUnit && line.saleUnit === product.materialUnit && selectedBalances.length > 0 && <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                        <input type="checkbox" checked={line.createRemnant} onChange={(event) => updateLine(line.key, { createRemnant: event.target.checked, saleQuantity: event.target.checked ? line.saleQuantity : "" })} className="mt-0.5" />
                        <span><strong>Create a remnant from opened package</strong><span className="block text-gray-600">Deduct the selected whole package(s), sell the quantity entered, and register the reusable balance as a separate remnant.</span></span>
                      </label>}
                      {line.createRemnant && product && <label className="block text-xs font-medium">Quantity to sell ({line.saleUnit})
                        <input type="number" min="0.0001" step="0.0001" value={line.saleQuantity} onChange={(event) => updateLine(line.key, { saleQuantity: event.target.value })} className="mt-1 w-full rounded border p-2" placeholder="Enter quantity sold from opened package(s)" />
                      </label>}
                      {!selectedBalances.length && !selectedRemnants.length && <p className="text-amber-700">No available stock sources for this variant.</p>}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Invoice quantity ({line.saleUnit || saleUnit(product)})</span>
                      <p className="mt-2 text-lg font-semibold">{quantity.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") || "0"}</p>
                      <span className="text-xs text-gray-500">Price / {line.saleUnit || saleUnit(product)}</span>
                      <p className="mt-1">{product ? money(saleUnitPrice(product, line.saleUnit || saleUnit(product))) : "—"}</p>
                    </div>
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => { invalidateRequestKey(); setLines((current) => current.filter((entry) => entry.key !== line.key)); }}
                      className="self-end rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                      aria-label={`Remove invoice line ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => { invalidateRequestKey(); setLines((current) => [...current, { key: crypto.randomUUID(), product: null, variantId: "", saleUnit: "", createRemnant: false, saleQuantity: "", allocations: {} }]); }} className="rounded-lg border border-emerald-800 px-3 py-2 text-sm font-medium text-emerald-900">
              Add product
            </button>

            <div className="ml-auto max-w-sm space-y-2 border-t border-gray-200 pt-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>GST (added to listed price)</span><span>{money(totals.tax)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{money(totals.total)}</span></div>
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium">
                  Amount received
                  <input
                    type="number" min="0" max={totals.total} step="0.01" inputMode="decimal"
                    value={receivedText}
                    onChange={(event) => { invalidateRequestKey(); setAmountReceived(event.target.value); }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Payment method
                  <select
                    value={paymentMethod}
                    onChange={(event) => { invalidateRequestKey(); setPaymentMethod(event.target.value as typeof paymentMethod); }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Reference (optional)
                  <input
                    maxLength={100} value={paymentReference}
                    onChange={(event) => { invalidateRequestKey(); setPaymentReference(event.target.value); }}
                    placeholder="Transaction or cheque number"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5"
                  />
                </label>
                <div className="flex justify-between font-semibold">
                  <span>Balance due</span>
                  <span className={dueAfterPayment > 0 ? "text-amber-800" : "text-emerald-800"}>{money(dueAfterPayment)}</span>
                </div>
                {needsCustomer && <p className="text-xs text-amber-800">Select or enter a customer to leave a balance due.</p>}
              </div>
              <button type="submit" disabled={saving || !locationId || !lines.length || paymentInvalid || needsCustomer} className="mt-3 w-full rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {saving ? "Completing sale…" : "Complete sale"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Invoices</h2>
            <p className="mt-1 text-sm text-gray-600">Sales and stock deductions for the active business unit.</p>
          </div>
          <label className="text-sm font-medium">
            Search invoices
            <input value={saleSearch} onChange={(event) => { setSaleSearch(event.target.value); setPage(1); }} placeholder="Invoice or customer" className="mt-1 block rounded-lg border border-gray-300 p-2.5" />
          </label>
        </div>
        {loading ? <p className="mt-5 text-sm text-gray-600">Loading invoices…</p> : sales.items.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr><th className="py-2 pr-4">Invoice</th><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Customer</th><th className="py-2 pr-4">Tax mode</th><th className="py-2 pr-4 text-right">Total</th><th className="py-2 pr-4 text-right">Returns</th><th className="py-2 pr-4 text-right">Paid</th><th className="py-2 pr-4 text-right">Due / credit</th><th className="py-2 pr-4">Status</th><th className="py-2">Items</th></tr>
              </thead>
              <tbody>
                {sales.items.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold"><Link href={`/sales/${sale.id}`} className="text-emerald-900 hover:underline">{sale.invoiceNumber}</Link></td>
                    <td className="py-3 pr-4">{new Date(sale.createdAt).toLocaleString("en-IN")}</td>
                    <td className="py-3 pr-4">{sale.customerName || "Walk-in"}</td>
                    <td className="py-3 pr-4">{sale.taxMode === "GST" ? "GST" : "Non-GST"}</td>
                    <td className="py-3 pr-4 text-right">{money(sale.total)}</td>
                    <td className="py-3 pr-4 text-right">{money(sale.returnedAmount)}</td>
                    <td className="py-3 pr-4 text-right">{money(sale.paidAmount)}</td>
                    <td className="py-3 pr-4 text-right font-medium">{money(sale.creditBalance !== "0" ? sale.creditBalance : sale.balanceDue)}</td>
                    <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs ${sale.paymentStatus === "PAID" ? "bg-emerald-50 text-emerald-800" : sale.paymentStatus === "PARTIAL" ? "bg-amber-50 text-amber-800" : sale.paymentStatus === "CREDIT" ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{sale.paymentStatus.toLowerCase()}</span></td>
                    <td className="py-3">{sale._count.lines}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No invoices recorded for this business unit.</p>}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>{sales.total} invoice{sales.total === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50">Previous</button>
            <span className="px-2 py-1.5">{page} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
