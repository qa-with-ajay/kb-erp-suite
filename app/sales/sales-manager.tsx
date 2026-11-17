"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string; code: string };
type CustomerOption = { id: string; name: string; phone: string | null };
type Product = {
  id: string;
  name: string;
  sku: string;
  baseUnit: string;
  productType: "STANDARD" | "PANEL";
  sellingPrice: string;
  gstPercentage: string;
  variants: Array<{ id: string; code: string | null; attributes: Record<string, string> }>;
  stockBalances: Array<{ variantId: string | null; quantity: string }>;
};
type DraftLine = { key: string; product: Product | null; variantId: string; quantity: string };
type SaleRow = {
  id: string;
  invoiceNumber: string;
  taxMode: "GST" | "NON_GST";
  customerName: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
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

function availableQuantity(line: DraftLine) {
  if (!line.product) return 0;
  const balance = line.product.stockBalances.find((item) => item.variantId === (line.variantId || null));
  return Number(balance?.quantity ?? 0);
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
  const [lines, setLines] = useState<DraftLine[]>([{ key: crypto.randomUUID(), product: null, variantId: "", quantity: "1" }]);
  const [requestKey, setRequestKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    if (!line.product || !/^\d+$/.test(line.quantity)) return result;
    const quantity = Number(line.quantity);
    const lineSubtotal = roundMoney(Number(line.product.sellingPrice) * quantity);
    const lineTax = taxMode === "GST"
      ? roundMoney(lineSubtotal * Number(line.product.gstPercentage) / 100)
      : 0;
    return {
      subtotal: result.subtotal + lineSubtotal,
      tax: result.tax + lineTax,
      total: result.total + lineSubtotal + lineTax,
    };
  }, { subtotal: 0, tax: 0, total: 0 }), [lines, taxMode]);

  function invalidateRequestKey() {
    setRequestKey("");
  }

  function updateLine(key: string, update: Partial<DraftLine>) {
    invalidateRequestKey();
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...update } : line));
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
    if (completeLines.some((line) => Number(line.quantity) > availableQuantity(line))) {
      setError("One or more quantities exceed the available whole-unit stock.");
      return;
    }
    if (!window.confirm(`Confirm this full-unit sale for ${money(totals.total)}? Stock will be deducted immediately.`)) return;

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
          lines: completeLines.map((line) => ({
            productId: line.product.id,
            variantId: line.variantId || null,
            quantity: line.quantity,
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
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create invoice</h2>
          <p className="mt-1 text-sm text-gray-600">Sales use whole quantities in each product’s base unit. Panels must be set up as PCS; cutting is not supported.</p>
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

            <label className="block max-w-lg text-sm font-medium">
              Search products with stock
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Product name or SKU" className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const available = availableQuantity(line);
                return (
                  <div key={line.key} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                    <label className="text-sm font-medium">
                      Product
                      <select
                        required
                        value={line.product?.id ?? ""}
                        onChange={(event) => {
                          const product = products.find((candidate) => candidate.id === event.target.value) ?? null;
                          updateLine(line.key, { product, variantId: "", quantity: "1" });
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
                        onChange={(event) => updateLine(line.key, { variantId: event.target.value })}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5 disabled:bg-gray-100"
                      >
                        <option value="">{line.product?.variants.length ? "Select variant" : "No variant"}</option>
                        {line.product?.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Quantity (whole {line.product?.baseUnit ?? "units"})
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        max={available}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5"
                      />
                      <span className="mt-1 block text-xs text-gray-500">Available: {available}</span>
                    </label>
                    <div className="text-sm">
                      <span className="font-medium">Unit price</span>
                      <p className="mt-3">{line.product ? money(line.product.sellingPrice) : "—"}</p>
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
            <button type="button" onClick={() => { invalidateRequestKey(); setLines((current) => [...current, { key: crypto.randomUUID(), product: null, variantId: "", quantity: "1" }]); }} className="rounded-lg border border-emerald-800 px-3 py-2 text-sm font-medium text-emerald-900">
              Add product
            </button>

            <div className="ml-auto max-w-sm space-y-2 border-t border-gray-200 pt-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>GST (added to listed price)</span><span>{money(totals.tax)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{money(totals.total)}</span></div>
              <button type="submit" disabled={saving || !locationId || !lines.length} className="mt-3 w-full rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
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
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr><th className="py-2 pr-4">Invoice</th><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Customer</th><th className="py-2 pr-4">Tax mode</th><th className="py-2 pr-4 text-right">Total</th><th className="py-2 pr-4 text-right">Paid</th><th className="py-2 pr-4 text-right">Balance due</th><th className="py-2 pr-4">Status</th><th className="py-2">Items</th></tr>
              </thead>
              <tbody>
                {sales.items.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold"><Link href={`/sales/${sale.id}`} className="text-emerald-900 hover:underline">{sale.invoiceNumber}</Link></td>
                    <td className="py-3 pr-4">{new Date(sale.createdAt).toLocaleString("en-IN")}</td>
                    <td className="py-3 pr-4">{sale.customerName || "Walk-in"}</td>
                    <td className="py-3 pr-4">{sale.taxMode === "GST" ? "GST" : "Non-GST"}</td>
                    <td className="py-3 pr-4 text-right">{money(sale.total)}</td>
                    <td className="py-3 pr-4 text-right">{money(sale.paidAmount)}</td>
                    <td className="py-3 pr-4 text-right font-medium">{money(sale.balanceDue)}</td>
                    <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs ${sale.paymentStatus === "PAID" ? "bg-emerald-50 text-emerald-800" : sale.paymentStatus === "PARTIAL" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{sale.paymentStatus.toLowerCase()}</span></td>
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
