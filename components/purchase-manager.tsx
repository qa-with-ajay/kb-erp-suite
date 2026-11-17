"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Supplier = { id: string; name: string; phone: string | null; gstin: string | null };
type Location = { id: string; name: string; code: string };
type ProductOption = {
  id: string;
  name: string;
  sku: string;
  baseUnit: string;
  purchasePrice: string;
  gstPercentage: string;
  unitConversions: Array<{
    unit: string;
    conversionFactor: string;
    precision: number;
    roundingMode: "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP";
  }>;
  variants: Array<{ id: string; code: string | null; attributes: Record<string, string> }>;
};
type PageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };
type OptionsResponse = {
  suppliers: Supplier[];
  supplierCount: number;
  locations: Location[];
  page: number;
  pageSize: number;
};
type PurchaseOrderRow = {
  id: string;
  orderNumber: string;
  status: "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED";
  taxMode: "GST" | "NON_GST";
  orderDate: string;
  expectedDate: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  supplier: Supplier;
  _count: { lines: number; receipts: number };
};
type OrderLine = {
  id: string;
  productName: string;
  sku: string;
  baseUnit: string;
  variantCode: string | null;
  variantAttributes: Record<string, string> | null;
  purchaseQuantity: string;
  receivedPurchaseQuantity: string;
  purchaseUnit: string;
  conversionFactor: string;
  conversionPrecision: number;
  roundingMode: "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP";
  quantity: string;
  receivedQuantity: string;
  unitCost: string;
  purchaseUnitCost: string;
  gstPercentage: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
};
type ReceiptLine = {
  productName: string;
  sku: string;
  variantCode: string | null;
  variantAttributes: Record<string, string> | null;
  purchaseQuantity: string;
  purchaseUnit: string;
  conversionFactor: string;
  quantity: string;
  baseUnit: string;
  unitCost: string;
  purchaseUnitCost: string;
  lineTotal: string;
};
type Receipt = {
  id: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string | null;
  createdAt: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  location: { id: string; name: string };
  lines: ReceiptLine[];
};
type PurchaseOrderDetail = PurchaseOrderRow & {
  notes: string | null;
  supplier: Supplier;
  lines: OrderLine[];
  receipts: Receipt[];
};
type DraftLine = {
  key: string;
  product: ProductOption | null;
  variantId: string;
  purchaseUnit: string;
  quantity: string;
  unitCost: string;
  gstPercentage: string;
};
type ReceiptDraftLine = { purchaseOrderLineId: string; purchaseQuantity: string };

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new Error("The server returned an invalid response.");
  }
  const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : undefined;
  if (!response.ok) throw new Error(message ?? `The request failed (HTTP ${response.status}).`);
  if (body === null) throw new Error("The server returned an empty response.");
  return body as T;
}

function money(value: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}

function quantityLabel(value: number | string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 8 }).format(Number(value));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function variantLabel(variant: ProductOption["variants"][number]) {
  return [variant.code, ...Object.entries(variant.attributes).map(([key, value]) => `${key}: ${value}`)]
    .filter(Boolean)
    .join(" · ");
}

function savedVariantLabel(code: string | null, attributes: Record<string, string> | null) {
  return [code, ...Object.entries(attributes ?? {}).map(([key, value]) => `${key}: ${value}`)]
    .filter(Boolean)
    .join(" · ");
}

function purchaseUnitFactor(product: ProductOption, unit: string) {
  return unit === product.baseUnit
    ? 1
    : Number(product.unitConversions.find((conversion) => conversion.unit === unit)?.conversionFactor ?? 0);
}

function defaultPurchaseUnitCost(product: ProductOption, unit: string) {
  return (Number(product.purchasePrice) * purchaseUnitFactor(product, unit)).toFixed(4);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function statusStyle(status: PurchaseOrderRow["status"]) {
  if (status === "RECEIVED") return "bg-emerald-50 text-emerald-800";
  if (status === "PARTIALLY_RECEIVED") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function newDraftLine(): DraftLine {
  return { key: crypto.randomUUID(), product: null, variantId: "", purchaseUnit: "", quantity: "1", unitCost: "", gstPercentage: "0" };
}

export function PurchaseManager() {
  const [orders, setOrders] = useState<PageResponse<PurchaseOrderRow>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [receipts, setReceipts] = useState<PageResponse<Receipt & {
    supplier: Supplier;
    purchaseOrder: { id: string; orderNumber: string };
    _count: { lines: number };
  }>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [options, setOptions] = useState<OptionsResponse>({ suppliers: [], supplierCount: 0, locations: [], page: 1, pageSize: 100 });
  const [products, setProducts] = useState<PageResponse<ProductOption>>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [view, setView] = useState<"orders" | "receipts">("orders");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [taxMode, setTaxMode] = useState<"GST" | "NON_GST">("GST");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiptLocationId, setReceiptLocationId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);
  const [receiptIdempotencyKey, setReceiptIdempotencyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const loadOrders = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({ search, page: String(page), pageSize: "20" });
    if (status) query.set("status", status);
    setOrders(await readJson<PageResponse<PurchaseOrderRow>>(await fetch(`/api/purchases/orders?${query}`, { signal })));
  }, [page, search, status]);

  const loadReceipts = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({ search, page: String(page), pageSize: "20" });
    setReceipts(await readJson<PageResponse<typeof receipts.items[number]>>(
      await fetch(`/api/purchases/receipts?${query}`, { signal }),
    ));
  }, [page, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const load = view === "orders" ? loadOrders(controller.signal) : loadReceipts(controller.signal);
    load.catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load purchase records.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadOrders, loadReceipts, refresh, view]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      search: supplierSearch,
      page: String(supplierPage),
      pageSize: "100",
    });
    fetch(`/api/purchases/options?${query}`, { signal: controller.signal })
      .then((response) => readJson<OptionsResponse>(response))
      .then((data) => {
        setOptions(data);
        setReceiptLocationId((current) => current || data.locations[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load suppliers and stock locations.");
      });
    return () => controller.abort();
  }, [supplierSearch, supplierPage]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ search: productSearch, page: "1", pageSize: "50" });
    fetch(`/api/purchases/products?${query}`, { signal: controller.signal })
      .then((response) => readJson<PageResponse<ProductOption>>(response))
      .then(setProducts)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load products.");
      });
    return () => controller.abort();
  }, [productSearch]);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrder(null);
      return;
    }
    const controller = new AbortController();
    setOrderLoading(true);
    fetch(`/api/purchases/orders/${selectedOrderId}`, { signal: controller.signal })
      .then((response) => readJson<{ order: PurchaseOrderDetail }>(response))
      .then(({ order: loadedOrder }) => setOrder(loadedOrder))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load purchase order.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setOrderLoading(false);
      });
    return () => controller.abort();
  }, [selectedOrderId, refresh]);

  const orderTotals = useMemo(() => lines.reduce((result, line) => {
    if (!line.product || !/^\d+(?:\.\d{1,4})?$/.test(line.quantity) || !/^\d+(?:\.\d{1,4})?$/.test(line.unitCost)) return result;
    const lineSubtotal = roundMoney(Number(line.unitCost) * Number(line.quantity));
    const lineTax = taxMode === "GST" ? roundMoney(lineSubtotal * Number(line.gstPercentage || "0") / 100) : 0;
    return {
      subtotal: result.subtotal + lineSubtotal,
      tax: result.tax + lineTax,
      total: result.total + lineSubtotal + lineTax,
    };
  }, { subtotal: 0, tax: 0, total: 0 }), [lines, taxMode]);

  const orderPageCount = Math.max(1, Math.ceil(orders.total / orders.pageSize));
  const receiptPageCount = Math.max(1, Math.ceil(receipts.total / receipts.pageSize));
  const supplierPageCount = Math.max(1, Math.ceil(options.supplierCount / options.pageSize));
  const listPageCount = view === "orders" ? orderPageCount : receiptPageCount;

  function resetOrderForm() {
    setLines([newDraftLine()]);
    setTaxMode("GST");
    setExpectedDate("");
    setNotes("");
    setSelectedSupplier(null);
    setSupplierSearch("");
    setSupplierPage(1);
    setProductSearch("");
    setIdempotencyKey("");
  }

  function updateDraftLine(key: string, update: Partial<DraftLine>) {
    setIdempotencyKey("");
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...update } : line));
  }

  function chooseProduct(key: string, productId: string) {
    const product = products.items.find((candidate) => candidate.id === productId) ?? null;
    updateDraftLine(key, {
      product,
      variantId: product?.variants.length === 1 ? product.variants[0].id : "",
      purchaseUnit: product?.baseUnit ?? "",
      unitCost: product ? defaultPurchaseUnitCost(product, product.baseUnit) : "",
      gstPercentage: product?.gstPercentage ?? "0",
    });
  }

  function choosePurchaseUnit(key: string, product: ProductOption, unit: string) {
    updateDraftLine(key, {
      purchaseUnit: unit,
      unitCost: defaultPurchaseUnitCost(product, unit),
    });
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selectedSupplier) {
      setError("Select an active supplier for this purchase order.");
      return;
    }
    if (lines.some((line) => !line.product)) {
      setError("Choose a product for every purchase order line.");
      return;
    }
    if (lines.some((line) => line.product?.variants.length && !line.variantId)) {
      setError("Select a variant for each product that has active variants.");
      return;
    }
    if (lines.some((line) =>
      !/^\d+(?:\.\d{1,4})?$/.test(line.quantity) ||
      Number(line.quantity) <= 0 ||
      !/^\d+(?:\.\d{1,4})?$/.test(line.unitCost) ||
      !/^\d{1,3}(?:\.\d{1,2})?$/.test(line.gstPercentage) ||
      Number(line.gstPercentage) > 100
    )) {
      setError("Enter positive quantities and valid non-negative cost and GST values.");
      return;
    }
    if (!window.confirm(`Create this purchase order for ${money(orderTotals.total)}?`)) return;
    setSaving(true);
    const requestKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(requestKey);
    try {
      const result = await readJson<{ purchaseOrderId: string; orderNumber: string }>(await fetch("/api/purchases/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          taxMode,
          expectedDate: expectedDate ? new Date(`${expectedDate}T00:00:00.000Z`).toISOString() : null,
          notes,
          idempotencyKey: requestKey,
          lines: lines.map((line) => ({
            productId: line.product!.id,
            variantId: line.variantId || null,
            purchaseQuantity: line.quantity,
            purchaseUnit: line.purchaseUnit,
            unitCost: line.unitCost,
            gstPercentage: line.gstPercentage,
          })),
        }),
      }));
      setNotice(`Purchase order ${result.orderNumber} created.`);
      setCreateOpen(false);
      setSelectedOrderId(result.purchaseOrderId);
      resetOrderForm();
      setPage(1);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the purchase order.");
    } finally {
      setSaving(false);
    }
  }

  function startReceiving(selected: PurchaseOrderDetail) {
    setReceiptLines(selected.lines
      .filter((line) => Number(line.purchaseQuantity) > Number(line.receivedPurchaseQuantity))
      .map((line) => ({
        purchaseOrderLineId: line.id,
        purchaseQuantity: String(Number(line.purchaseQuantity) - Number(line.receivedPurchaseQuantity)),
      })));
    setSupplierInvoiceNumber("");
    setSupplierInvoiceDate("");
    setReceiptIdempotencyKey("");
    setReceiveOpen(true);
    setError("");
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    setError("");
    setNotice("");
    const submittedLines = receiptLines.filter((line) => Number(line.purchaseQuantity) > 0);
    if (!submittedLines.length) {
      setError("Enter a quantity to receive for at least one order line.");
      return;
    }
    const exceedsRemaining = submittedLines.some((draft) => {
      const orderLine = order.lines.find((line) => line.id === draft.purchaseOrderLineId);
      return !orderLine ||
        !/^\d+(?:\.\d{1,4})?$/.test(draft.purchaseQuantity) ||
        Number(draft.purchaseQuantity) >
          Number(orderLine.purchaseQuantity) - Number(orderLine.receivedPurchaseQuantity);
    });
    if (exceedsRemaining) {
      setError("A received quantity exceeds the remaining order quantity.");
      return;
    }
    if (!window.confirm("Receive these quantities into stock? This will update stock balances and the ledger immediately.")) return;
    setSaving(true);
    const key = receiptIdempotencyKey || crypto.randomUUID();
    setReceiptIdempotencyKey(key);
    try {
      await readJson(await fetch("/api/purchases/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: order.id,
          locationId: receiptLocationId,
          supplierInvoiceNumber,
          supplierInvoiceDate: supplierInvoiceDate
            ? new Date(`${supplierInvoiceDate}T00:00:00.000Z`).toISOString()
            : null,
          idempotencyKey: key,
          lines: submittedLines,
        }),
      }));
      setNotice(`Goods receipt recorded for ${order.orderNumber}.`);
      setReceiveOpen(false);
      setReceiptIdempotencyKey("");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record the goods receipt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Purchase records">
          <button type="button" role="tab" aria-selected={view === "orders"} onClick={() => { setView("orders"); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "orders" ? "bg-emerald-900 text-white" : "border border-gray-300 bg-white text-gray-700"}`}>Purchase orders</button>
          <button type="button" role="tab" aria-selected={view === "receipts"} onClick={() => { setView("receipts"); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "receipts" ? "bg-emerald-900 text-white" : "border border-gray-300 bg-white text-gray-700"}`}>Goods receipts</button>
        </div>
        {view === "orders" && (
          <button type="button" onClick={() => { setCreateOpen((value) => !value); setError(""); setNotice(""); }} className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
            {createOpen ? "Close form" : "Create purchase order"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

      {createOpen && view === "orders" && (
        <form onSubmit={submitOrder} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">New purchase order</h2>
              <p className="mt-1 text-sm text-gray-600">Choose a configured purchase unit; received quantities convert to the product’s base unit.</p>
            </div>
            <button type="button" onClick={() => { setCreateOpen(false); resetOrderForm(); }} className="text-sm font-medium text-gray-600 hover:underline">Cancel</button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="supplier-search" className="block text-sm font-medium">Find supplier</label>
              <input id="supplier-search" value={supplierSearch} onChange={(event) => { setSupplierSearch(event.target.value); setSupplierPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" placeholder="Search supplier name, phone or GSTIN" />
              <select aria-label="Supplier" value={selectedSupplier?.id ?? ""} onChange={(event) => { setSelectedSupplier(options.suppliers.find((supplier) => supplier.id === event.target.value) ?? null); setIdempotencyKey(""); }} className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-2.5" required>
                <option value="">Select a supplier</option>
                {selectedSupplier && !options.suppliers.some((supplier) => supplier.id === selectedSupplier.id) && <option value={selectedSupplier.id}>{selectedSupplier.name}</option>}
                {options.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.phone ? ` · ${supplier.phone}` : ""}</option>)}
              </select>
              <p className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>{options.supplierCount} active suppliers</span>
                {supplierPageCount > 1 && <span className="flex gap-2">
                  <button type="button" disabled={supplierPage <= 1} onClick={() => setSupplierPage((value) => value - 1)} className="disabled:opacity-40">Previous</button>
                  {supplierPage}/{supplierPageCount}
                  <button type="button" disabled={supplierPage >= supplierPageCount} onClick={() => setSupplierPage((value) => value + 1)} className="disabled:opacity-40">Next</button>
                </span>}
              </p>
            </div>
            <label className="block text-sm font-medium">
              Tax mode
              <select value={taxMode} onChange={(event) => { setTaxMode(event.target.value as "GST" | "NON_GST"); setIdempotencyKey(""); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="GST">GST</option><option value="NON_GST">Non-GST</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Expected delivery (optional)
              <input type="date" value={expectedDate} onChange={(event) => { setExpectedDate(event.target.value); setIdempotencyKey(""); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="min-w-60 flex-1 text-sm font-medium">
              Search products
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" placeholder="Product name, SKU or barcode" />
            </label>
            <button type="button" onClick={() => { setIdempotencyKey(""); setLines((current) => [...current, newDraftLine()]); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold hover:border-emerald-800">Add line</button>
          </div>
          <p className="text-xs text-gray-500">Unit cost is per selected purchase unit. The default is converted from the product’s base-unit purchase price; confirm the supplier price.</p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr><th className="py-2 pr-3">Product</th><th className="py-2 pr-3">Variant</th><th className="py-2 pr-3">Purchase unit</th><th className="py-2 pr-3">Quantity</th><th className="py-2 pr-3">Cost / unit</th><th className="py-2 pr-3">GST %</th><th className="py-2 pr-3">Line total</th><th className="py-2"> </th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line) => {
                  const listedProduct = products.items.find((product) => product.id === line.product?.id);
                  const productOptions = line.product && !listedProduct ? [line.product, ...products.items] : products.items;
                  const selectedProduct = line.product;
                  const subtotal = selectedProduct && Number(line.quantity) > 0 && Number(line.unitCost) >= 0
                    ? roundMoney(Number(line.quantity) * Number(line.unitCost)) : 0;
                  const tax = taxMode === "GST" ? roundMoney(subtotal * Number(line.gstPercentage || "0") / 100) : 0;
                  return (
                    <tr key={line.key}>
                      <td className="py-3 pr-3">
                        <select aria-label="Product" value={selectedProduct?.id ?? ""} onChange={(event) => chooseProduct(line.key, event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white p-2" required>
                          <option value="">Select product</option>
                          {productOptions.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
                        </select>
                        {selectedProduct && <span className="mt-1 block text-xs text-gray-500">Base unit: {selectedProduct.baseUnit}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        <select aria-label="Variant" disabled={!selectedProduct?.variants.length} required={Boolean(selectedProduct?.variants.length)} value={line.variantId} onChange={(event) => updateDraftLine(line.key, { variantId: event.target.value })} className="w-full rounded-lg border border-gray-300 bg-white p-2 disabled:bg-gray-50">
                          <option value="">{selectedProduct?.variants.length ? "Select variant" : "No variants"}</option>
                          {selectedProduct?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>)}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <select aria-label="Purchase unit" required disabled={!selectedProduct} value={line.purchaseUnit} onChange={(event) => selectedProduct && choosePurchaseUnit(line.key, selectedProduct, event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white p-2 disabled:bg-gray-50">
                          <option value="">Select unit</option>
                          {selectedProduct && [selectedProduct.baseUnit, ...selectedProduct.unitConversions.map((conversion) => conversion.unit)]
                            .map((unit) => <option key={unit} value={unit}>{unit}{unit === selectedProduct.baseUnit ? " (base)" : ""}</option>)}
                        </select>
                        {selectedProduct && line.purchaseUnit && <span className="mt-1 block text-xs text-gray-500">1 {line.purchaseUnit} = {purchaseUnitFactor(selectedProduct, line.purchaseUnit)} {selectedProduct.baseUnit}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        <input aria-label="Quantity" type="number" min="0.0001" step="0.0001" max="99999999999999.9999" required value={line.quantity} onChange={(event) => updateDraftLine(line.key, { quantity: event.target.value })} className="w-28 rounded-lg border border-gray-300 p-2" />
                        {selectedProduct && line.purchaseUnit && Number(line.quantity) > 0 && <span className="mt-1 block text-xs text-gray-500">≈ {quantityLabel(Number(line.quantity) * purchaseUnitFactor(selectedProduct, line.purchaseUnit))} {selectedProduct.baseUnit}</span>}
                      </td>
                      <td className="py-3 pr-3"><input aria-label="Unit cost" type="number" min="0" step="0.0001" max="9999999999.9999" required value={line.unitCost} onChange={(event) => updateDraftLine(line.key, { unitCost: event.target.value })} className="w-32 rounded-lg border border-gray-300 p-2" /></td>
                      <td className="py-3 pr-3"><input aria-label="GST percentage" type="number" min="0" max="100" step="0.01" required value={line.gstPercentage} onChange={(event) => updateDraftLine(line.key, { gstPercentage: event.target.value })} className="w-24 rounded-lg border border-gray-300 p-2" /></td>
                      <td className="py-3 pr-3 font-medium">{money(subtotal + tax)}</td>
                      <td className="py-3 text-right"><button type="button" disabled={lines.length === 1} onClick={() => { setIdempotencyKey(""); setLines((current) => current.filter((entry) => entry.key !== line.key)); }} className="text-sm text-red-700 hover:underline disabled:opacity-40">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <label className="block text-sm font-medium">
              Notes (optional)
              <textarea maxLength={1000} value={notes} onChange={(event) => { setNotes(event.target.value); setIdempotencyKey(""); }} rows={3} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
            </label>
            <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
              <p className="flex justify-between"><span>Subtotal</span><span>{money(orderTotals.subtotal)}</span></p>
              <p className="flex justify-between"><span>GST</span><span>{money(orderTotals.tax)}</span></p>
              <p className="flex justify-between border-t border-gray-200 pt-2 font-semibold"><span>Total</span><span>{money(orderTotals.total)}</span></p>
              <button type="submit" disabled={saving} className="mt-2 w-full rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {saving ? "Creating…" : "Create purchase order"}
              </button>
              {!options.locations.length && <p className="text-xs text-gray-500">A stock location will be required when you receive the goods.</p>}
            </div>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1 text-sm font-medium">
            Search {view === "orders" ? "orders" : "receipts"}
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" placeholder={view === "orders" ? "Order number or supplier" : "Invoice number, order number or supplier"} />
          </label>
          {view === "orders" && (
            <label className="text-sm font-medium">
              Status
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
                <option value="">All statuses</option>
                <option value="ORDERED">Ordered</option>
                <option value="PARTIALLY_RECEIVED">Partially received</option>
                <option value="RECEIVED">Received</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-5 overflow-x-auto">
          {view === "orders" ? (
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Supplier</th><th className="py-3 pr-4">Date</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4 text-right">Total</th><th className="py-3 text-right">Details</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading purchase orders…</td></tr>
                  : orders.items.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-gray-500">No purchase orders found.</td></tr>
                    : orders.items.map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 pr-4 font-semibold">{row.orderNumber}<span className="mt-1 block text-xs font-normal text-gray-500">{row._count.lines} line{row._count.lines === 1 ? "" : "s"} · {row._count.receipts} receipt{row._count.receipts === 1 ? "" : "s"}</span></td>
                        <td className="py-3 pr-4">{row.supplier.name}</td>
                        <td className="py-3 pr-4">{dateLabel(row.orderDate)}</td>
                        <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs ${statusStyle(row.status)}`}>{row.status.replaceAll("_", " ")}</span></td>
                        <td className="py-3 pr-4 text-right font-medium">{money(row.total)}</td>
                        <td className="py-3 text-right"><button type="button" onClick={() => { setSelectedOrderId(row.id); setReceiveOpen(false); }} className="font-semibold text-emerald-900 hover:underline">View</button></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-3 pr-4">Supplier invoice</th><th className="py-3 pr-4">Supplier</th><th className="py-3 pr-4">Purchase order</th><th className="py-3 pr-4">Received at</th><th className="py-3 pr-4">Location</th><th className="py-3 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading receipts…</td></tr>
                  : receipts.items.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-gray-500">No goods receipts found.</td></tr>
                    : receipts.items.map((receipt) => (
                      <tr key={receipt.id}>
                        <td className="py-3 pr-4 font-semibold">{receipt.supplierInvoiceNumber}<span className="mt-1 block text-xs font-normal text-gray-500">{receipt._count.lines} line{receipt._count.lines === 1 ? "" : "s"}</span></td>
                        <td className="py-3 pr-4">{receipt.supplier.name}</td>
                        <td className="py-3 pr-4"><button type="button" onClick={() => { setView("orders"); setSelectedOrderId(receipt.purchaseOrder.id); }} className="text-emerald-900 hover:underline">{receipt.purchaseOrder.orderNumber}</button></td>
                        <td className="py-3 pr-4">{dateLabel(receipt.createdAt)}</td>
                        <td className="py-3 pr-4">{receipt.location.name}</td>
                        <td className="py-3 text-right font-medium">{money(receipt.total)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
          <span>{view === "orders" ? orders.total : receipts.total} total</span>
          <div className="flex items-center gap-3">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {page} of {listPageCount}</span>
            <button type="button" disabled={page >= listPageCount || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      {selectedOrderId && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {orderLoading || !order ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading purchase order details…</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{order.orderNumber}</h2>
                  <p className="mt-1 text-sm text-gray-600">{order.supplier.name} · Ordered {dateLabel(order.orderDate)} · {order.taxMode.replace("_", "-")}</p>
                  {order.expectedDate && <p className="mt-1 text-sm text-gray-500">Expected {dateLabel(order.expectedDate)}</p>}
                  {order.notes && <p className="mt-2 text-sm text-gray-600">{order.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${statusStyle(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
                  {order.status !== "RECEIVED" && <button type="button" onClick={() => startReceiving(order)} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Receive stock</button>}
                  <button type="button" onClick={() => { setSelectedOrderId(""); setReceiveOpen(false); }} className="text-sm text-gray-600 hover:underline">Close</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Ordered</th><th className="py-2 pr-4">Received</th><th className="py-2 pr-4">Remaining</th><th className="py-2 pr-4">Cost / purchase unit</th><th className="py-2 text-right">Line total</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-3 pr-4 font-medium">{line.productName}<span className="mt-1 block text-xs font-normal text-gray-500">{line.sku}{savedVariantLabel(line.variantCode, line.variantAttributes) ? ` · ${savedVariantLabel(line.variantCode, line.variantAttributes)}` : ""} · {line.baseUnit}</span></td>
                        <td className="py-3 pr-4">{quantityLabel(line.purchaseQuantity)} {line.purchaseUnit}<span className="mt-1 block text-xs text-gray-500">{quantityLabel(line.quantity)} {line.baseUnit} into stock</span></td>
                        <td className="py-3 pr-4">{quantityLabel(line.receivedPurchaseQuantity)} {line.purchaseUnit}<span className="mt-1 block text-xs text-gray-500">{quantityLabel(line.receivedQuantity)} {line.baseUnit} posted</span></td>
                        <td className="py-3 pr-4 font-medium">{quantityLabel(Number(line.purchaseQuantity) - Number(line.receivedPurchaseQuantity))} {line.purchaseUnit}</td>
                        <td className="py-3 pr-4">{money(line.purchaseUnitCost)} / {line.purchaseUnit}</td>
                        <td className="py-3 text-right">{money(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {receiveOpen && (
                <form onSubmit={submitReceipt} className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <div>
                    <h3 className="font-semibold">Receive goods</h3>
                    <p className="mt-1 text-xs text-gray-600">Received stock is posted to the selected location immediately.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm font-medium">
                      Stock location *
                      <select required value={receiptLocationId} onChange={(event) => { setReceiptLocationId(event.target.value); setReceiptIdempotencyKey(""); }} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2.5">
                        <option value="">Select location</option>
                        {options.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Supplier invoice number *
                      <input required maxLength={100} value={supplierInvoiceNumber} onChange={(event) => { setSupplierInvoiceNumber(event.target.value); setReceiptIdempotencyKey(""); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                    </label>
                    <label className="text-sm font-medium">
                      Invoice date (optional)
                      <input type="date" value={supplierInvoiceDate} onChange={(event) => { setSupplierInvoiceDate(event.target.value); setReceiptIdempotencyKey(""); }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Remaining</th><th className="py-2">Receive now</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {receiptLines.map((draft) => {
                          const line = order.lines.find((entry) => entry.id === draft.purchaseOrderLineId);
                          if (!line) return null;
                          const remaining = Number(line.purchaseQuantity) - Number(line.receivedPurchaseQuantity);
                          return (
                            <tr key={draft.purchaseOrderLineId}>
                              <td className="py-3 pr-4 font-medium">{line.productName}<span className="mt-1 block text-xs font-normal text-gray-500">{line.sku} · {line.baseUnit}</span></td>
                              <td className="py-3 pr-4">{quantityLabel(remaining)} {line.purchaseUnit}<span className="mt-1 block text-xs text-gray-500">1 {line.purchaseUnit} = {line.conversionFactor} {line.baseUnit}</span></td>
                              <td className="py-3"><input type="number" aria-label={`Receive quantity for ${line.productName}`} min="0" step="0.0001" max={remaining} value={draft.purchaseQuantity} onChange={(event) => { setReceiptIdempotencyKey(""); setReceiptLines((current) => current.map((entry) => entry.purchaseOrderLineId === draft.purchaseOrderLineId ? { ...entry, purchaseQuantity: event.target.value } : entry)); }} className="w-36 rounded-lg border border-gray-300 p-2" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setReceiveOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Cancel</button>
                    <button type="submit" disabled={saving || !receiptLocationId} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Recording…" : "Confirm receipt"}</button>
                  </div>
                </form>
              )}

              <div>
                <h3 className="font-semibold">Receipt history</h3>
                {order.receipts.length ? (
                  <div className="mt-3 space-y-3">
                    {order.receipts.map((receipt) => (
                      <article key={receipt.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <p className="font-semibold">{receipt.supplierInvoiceNumber} <span className="font-normal text-gray-500">· {dateLabel(receipt.createdAt)} · {receipt.location.name}</span></p>
                          <p className="font-semibold">{money(receipt.total)}</p>
                        </div>
                        <ul className="mt-2 divide-y divide-gray-100 text-sm">
                          {receipt.lines.map((line, index) => <li key={`${receipt.id}-${index}`} className="flex justify-between gap-4 py-2"><span>{line.productName}{savedVariantLabel(line.variantCode, line.variantAttributes) ? ` (${savedVariantLabel(line.variantCode, line.variantAttributes)})` : ""} <span className="text-gray-500">· {quantityLabel(line.purchaseQuantity)} {line.purchaseUnit} received as {quantityLabel(line.quantity)} {line.baseUnit}</span></span><span>{money(line.lineTotal)}</span></li>)}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : <p className="mt-2 text-sm text-gray-500">No receipts have been recorded for this order.</p>}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
