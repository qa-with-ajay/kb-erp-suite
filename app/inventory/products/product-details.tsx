"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BarcodeLabel } from "@/components/barcode-label";

type Variant = {
  id: string;
  code: string | null;
  barcode: string | null;
  attributes: Record<string, string>;
  isActive: boolean;
};
type Conversion = {
  id: string;
  unit: string;
  conversionFactor: string;
  isPurchaseUnit: boolean;
  isSalesUnit: boolean;
  precision: number;
  roundingMode: string;
};
type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  productType: "STANDARD" | "PANEL";
  baseUnit: string;
  sellingPrice: string;
  gstPercentage: string;
  minimumStock: string;
  barcode: string | null;
  barcodeType: "INTERNAL" | "MANUFACTURER";
  imageUrl: string | null;
  isActive: boolean;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  variants: Variant[];
  unitConversions: Conversion[];
  stockBalances: {
    id: string;
    quantity: string;
    location: { id: string; name: string; code: string };
    variant: { id: string; code: string | null; attributes: Record<string, string> } | null;
  }[];
  stockLocations: { id: string; name: string; code: string }[];
};
type AttributeRow = { key: string; value: string };
const units = ["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"];
const roundingModes = ["HALF_UP", "HALF_EVEN", "DOWN", "UP"];
const blankAttributes = [{ key: "", value: "" }];

type Props = { productId: string; canManage: boolean };

export function ProductDetails({ productId, canManage }: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ type: "product" } | { type: "variant"; variant: Variant } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusTriggerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(false);
  pendingRef.current = pending;
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantCode, setVariantCode] = useState("");
  const [variantBarcode, setVariantBarcode] = useState("");
  const [attributes, setAttributes] = useState<AttributeRow[]>(blankAttributes);
  const [unit, setUnit] = useState("PCS");
  const [factor, setFactor] = useState("1");
  const [isPurchaseUnit, setIsPurchaseUnit] = useState(true);
  const [isSalesUnit, setIsSalesUnit] = useState(true);
  const [precision, setPrecision] = useState("4");
  const [roundingMode, setRoundingMode] = useState("HALF_UP");

  const loadProduct = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/inventory/products/${productId}`, { signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load product.");
    setProduct(body as Product);
    setUnit((current) => current === body.baseUnit ? units.find((item) => item !== body.baseUnit) ?? body.baseUnit : current);
  }, [productId]);

  useEffect(() => {
    const controller = new AbortController();
    loadProduct(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load product.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadProduct]);

  function resetVariantForm() {
    setEditingVariantId(null);
    setVariantCode("");
    setVariantBarcode("");
    setAttributes(blankAttributes);
  }

  function editVariant(variant: Variant) {
    setEditingVariantId(variant.id);
    setVariantCode(variant.code ?? "");
    setVariantBarcode(variant.barcode ?? "");
    const rows = Object.entries(variant.attributes).map(([key, value]) => ({ key, value }));
    setAttributes(rows.length ? rows : blankAttributes);
    setError(null);
  }

  function chooseUnit(value: string) {
    setUnit(value);
    const existing = product?.unitConversions.find((item) => item.unit === value);
    if (existing) {
      setFactor(existing.conversionFactor);
      setIsPurchaseUnit(existing.isPurchaseUnit);
      setIsSalesUnit(existing.isSalesUnit);
      setPrecision(String(existing.precision));
      setRoundingMode(existing.roundingMode);
    } else {
      setFactor("1");
      setIsPurchaseUnit(true);
      setIsSalesUnit(true);
      setPrecision("4");
      setRoundingMode("HALF_UP");
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = attributes.map(({ key, value }) => ({ key: key.trim(), value: value.trim() })).filter(({ key, value }) => key && value);
    const names = normalized.map(({ key }) => key.toLowerCase());
    if (normalized.length === 0 || new Set(names).size !== names.length) {
      setError("Enter at least one variant attribute and use each attribute name once.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editingVariantId
          ? `/api/inventory/products/${productId}/variants/${editingVariantId}`
          : `/api/inventory/products/${productId}/variants`,
        {
          method: editingVariantId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: variantCode || null,
            barcode: variantBarcode || null,
            attributes: Object.fromEntries(normalized.map(({ key, value }) => [key, value])),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save variant.");
      await loadProduct();
      setNotice(editingVariantId ? "Variant updated." : "Variant added.");
      resetVariantForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save variant.");
    } finally {
      setPending(false);
    }
  }

  function requestVariantStatusChange(variant: Variant) {
    statusTriggerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setNotice(null);
    setStatusChangeTarget({ type: "variant", variant });
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inventory/products/${productId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit,
          conversionFactor: factor,
          isPurchaseUnit,
          isSalesUnit,
          precision: Number(precision),
          roundingMode,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save unit conversion.");
      await loadProduct();
      setNotice(`${unit} conversion saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save unit conversion.");
    } finally {
      setPending(false);
    }
  }

  function requestProductStatusChange() {
    if (!product) return;
    statusTriggerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setNotice(null);
    setStatusChangeTarget({ type: "product" });
  }

  useEffect(() => {
    if (!statusChangeTarget) return;
    const previousFocus = statusTriggerRef.current;
    const focusable = () => dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    cancelButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pendingRef.current) {
        event.preventDefault();
        setStatusChangeTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(focusable() ?? []);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previousFocus?.isConnected && previousFocus.focus());
    };
  }, [statusChangeTarget]);

  async function confirmStatusChange() {
    if (!product || !statusChangeTarget || pending) return;
    const target = statusChangeTarget;
    const isActive = target.type === "product" ? product.isActive : target.variant.isActive;
    const action = isActive ? "deactivate" : "activate";
    const endpoint = target.type === "product"
      ? `/api/inventory/products/${product.id}`
      : `/api/inventory/products/${productId}/variants/${target.variant.id}`;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? `Unable to ${action} ${target.type}.`);
      }
      await loadProduct();
      setStatusChangeTarget(null);
      setNotice(target.type === "product" ? `Product ${action}d.` : `Variant ${action}d.`);
    } catch (cause) {
      setStatusChangeTarget(null);
      setError(cause instanceof Error ? cause.message : `Unable to ${action} ${target.type}.`);
    } finally {
      setPending(false);
    }
  }

  if (loading) return <main className="min-h-screen p-6 text-sm text-gray-600">Loading product…</main>;
  if (!product) return <main className="min-h-screen p-6"><p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error ?? "Product not found."}</p></main>;

  const conversions = [
    { unit: product.baseUnit, conversionFactor: "1", isPurchaseUnit: false, isSalesUnit: false, precision: 4, roundingMode: "HALF_UP", id: "base" },
    ...product.unitConversions,
  ];
  const totalAvailableStock = product.stockBalances.reduce((total, balance) => total + Number(balance.quantity), 0);
  const minimumStock = Number(product.minimumStock);
  const isBelowMinimumStock = minimumStock > 0 && totalAvailableStock < minimumStock;
  const stockRows = [
    ...product.stockBalances.map((balance) => ({ ...balance, isZeroBalanceLocation: false })),
    ...product.stockLocations
      .filter((location) => !product.stockBalances.some((balance) => balance.location.id === location.id))
      .map((location) => ({
        id: `zero-${location.id}`,
        quantity: "0",
        location,
        variant: null,
        isZeroBalanceLocation: true,
      })),
  ].sort((a, b) => a.location.name.localeCompare(b.location.name));

  return (
    <main className="min-h-screen p-5 md:p-10">
      {statusChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-confirmation-title"
            aria-describedby="status-confirmation-description"
            className="w-full max-w-md rounded-xl bg-white p-5 text-sm text-gray-900 shadow-2xl"
          >
            <h2 id="status-confirmation-title" className="text-lg font-semibold">
              Confirm {statusChangeTarget.type === "product"
                ? product.isActive ? "product deactivation" : "product activation"
                : statusChangeTarget.variant.isActive ? "variant deactivation" : "variant activation"}
            </h2>
            <p id="status-confirmation-description" className="mt-2 text-gray-600">
              {statusChangeTarget.type === "product"
                ? <>Are you sure you want to {product.isActive ? "deactivate" : "activate"} <span className="font-medium text-gray-900">{product.name}</span>?</>
                : <>Are you sure you want to {statusChangeTarget.variant.isActive ? "deactivate" : "activate"} this variant{statusChangeTarget.variant.code ? <> (<span className="font-medium text-gray-900">{statusChangeTarget.variant.code}</span>)</> : ""}?</>}
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                ref={cancelButtonRef}
                type="button"
                disabled={pending}
                onClick={() => setStatusChangeTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmStatusChange}
                className="rounded-lg bg-emerald-900 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {pending ? "Updating…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Products", href: "/inventory/products" }, { label: product.name }]} />
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="mt-1 text-sm text-gray-600">{product.sku} · {product.productType} · {product.baseUnit}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link href={`/inventory/products/${product.id}/edit`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Edit product</Link>
            <button disabled={pending} onClick={requestProductStatusChange} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50">{product.isActive ? "Deactivate" : "Activate"}</button>
          </div>
        )}
      </header>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="block text-xs text-gray-500">Category</span>{product.category?.name ?? "—"}</p>
        <p><span className="block text-xs text-gray-500">Brand</span>{product.brand?.name ?? "—"}</p>
        <p><span className="block text-xs text-gray-500">Selling price / GST</span>{product.sellingPrice} / {product.gstPercentage}%</p>
        <p><span className="block text-xs text-gray-500">Minimum stock</span>{product.minimumStock} {product.baseUnit}<span className="mt-1 block text-xs text-gray-500">Threshold applies to combined stock across all locations</span></p>
        <p><span className="block text-xs text-gray-500">Status</span>{product.isActive ? "Active" : "Inactive"}</p>
        <div className="sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-xs text-gray-500">Barcode · {product.barcodeType === "MANUFACTURER" ? "Manufacturer" : "KB internal"}</span>
          {product.barcode ? <BarcodeLabel value={product.barcode} title={product.name} /> : "—"}
          {product.barcodeType === "INTERNAL" && <p className="mt-1 text-xs text-gray-500">Internal Code 128 · Not a GS1/GTIN barcode</p>}
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-xs text-gray-500">Product image</span>
          {product.imageUrl ? (
            <a href={product.imageUrl} target="_blank" rel="noreferrer" className="inline-flex">
              <img src={product.imageUrl} alt={`${product.name} product image`} loading="lazy" className="h-28 w-28 rounded-lg border border-gray-200 object-contain p-1" />
            </a>
          ) : <span className="text-sm text-gray-500">No image added</span>}
        </div>
        {product.description && <p className="sm:col-span-2 lg:col-span-4"><span className="block text-xs text-gray-500">Description</span>{product.description}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Available stock</h2>
            <p className="mt-1 text-sm text-gray-600">Live balance from Stock Management, grouped by location and variant.</p>
          </div>
          <Link href="/inventory/stock" className="text-sm font-medium text-emerald-900 hover:underline">Open Stock Management</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <span className="block text-xs text-gray-500">Total available across locations</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums">{totalAvailableStock.toLocaleString("en-IN", { maximumFractionDigits: 4 })} {product.baseUnit}</span>
          </div>
          <div className={`rounded-lg p-3 ${isBelowMinimumStock ? "bg-amber-50" : "bg-gray-50"}`}>
            <span className="block text-xs text-gray-500">Minimum stock status</span>
            <span className={`mt-1 block text-sm font-semibold ${isBelowMinimumStock ? "text-amber-800" : "text-gray-900"}`}>{minimumStock <= 0 ? "No minimum set" : isBelowMinimumStock ? "Below minimum stock" : "Minimum stock met"}</span>
            <span className="mt-1 block text-xs text-gray-500">Minimum: {minimumStock.toLocaleString("en-IN", { maximumFractionDigits: 4 })} {product.baseUnit}</span>
          </div>
        </div>
        {isBelowMinimumStock && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Low stock: combined available quantity is below the minimum. Review replenishment across Warehouse and Showroom.
          </p>
        )}
        {product.stockLocations.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No active stock locations are configured for this business unit.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500"><tr><th className="py-2 pr-3">Location</th><th className="py-2 pr-3">Variant</th><th className="py-2 text-right">Available quantity</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {stockRows.map((balance) => (
                  <tr key={balance.id}>
                    <td className="py-3 pr-3">{balance.location.name} ({balance.location.code})</td>
                    <td className="py-3 pr-3">{balance.variant ? [balance.variant.code, Object.entries(balance.variant.attributes).map(([key, value]) => `${key}: ${value}`).join(", ")].filter(Boolean).join(" · ") : "—"}</td>
                    <td className="py-3 text-right font-medium tabular-nums">{Number(balance.quantity).toLocaleString("en-IN", { maximumFractionDigits: 4 })} {product.baseUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Product variants</h2>
          <p className="mt-1 text-sm text-gray-600">Variants are optional. Add attributes such as colour, thickness, size, or finish.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500"><tr><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Attributes</th><th className="py-2 pr-3">Status</th>{canManage && <th className="py-2 text-right">Actions</th>}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {product.variants.length === 0 ? <tr><td colSpan={canManage ? 4 : 3} className="py-5 text-gray-500">No variants.</td></tr> : product.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className="py-3 pr-3">{variant.code ?? "—"}</td>
                    <td className="py-3 pr-3">{Object.entries(variant.attributes).map(([key, value]) => `${key}: ${value}`).join(", ")}</td>
                    <td className="py-3 pr-3">{variant.isActive ? "Active" : "Inactive"}</td>
                    {canManage && <td className="py-3 text-right"><button disabled={pending} onClick={() => editVariant(variant)} className="mr-3 font-medium text-emerald-900 hover:underline">Edit</button><button disabled={pending} onClick={() => requestVariantStatusChange(variant)} className="font-medium text-gray-600 hover:underline">{variant.isActive ? "Deactivate" : "Activate"}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <form onSubmit={saveVariant} className="mt-5 border-t border-gray-100 pt-4">
              <h3 className="font-medium">{editingVariantId ? "Edit variant" : "Add variant"}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Variant code<input maxLength={80} value={variantCode} onChange={(event) => setVariantCode(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2" /></label>
                <label className="text-sm">Barcode<input maxLength={100} value={variantBarcode} onChange={(event) => setVariantBarcode(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2" /></label>
              </div>
              <div className="mt-3 space-y-2">
                {attributes.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input aria-label="Attribute name" placeholder="Colour" maxLength={40} value={row.key} onChange={(event) => setAttributes((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, key: event.target.value } : item))} className="rounded-lg border border-gray-300 p-2 text-sm" />
                    <input aria-label="Attribute value" placeholder="White" maxLength={100} value={row.value} onChange={(event) => setAttributes((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, value: event.target.value } : item))} className="rounded-lg border border-gray-300 p-2 text-sm" />
                    <button type="button" disabled={attributes.length === 1} onClick={() => setAttributes((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="rounded border border-gray-300 px-3 text-sm disabled:opacity-40">Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => setAttributes((rows) => [...rows, { key: "", value: "" }])} className="text-sm font-medium text-emerald-900 hover:underline">Add attribute</button>
              </div>
              <div className="mt-4 flex gap-2">
                <button disabled={pending} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : editingVariantId ? "Save variant" : "Add variant"}</button>
                {editingVariantId && <button type="button" onClick={resetVariantForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>}
              </div>
            </form>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Units and conversions</h2>
          <p className="mt-1 text-sm text-gray-600">Each factor describes how many base units are in one selected unit.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500"><tr><th className="py-2 pr-3">Unit</th><th className="py-2 pr-3">Base units per unit</th><th className="py-2 pr-3">Use</th><th className="py-2 pr-3">Precision</th><th className="py-2">Rounding</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {conversions.map((conversion) => (
                  <tr key={conversion.id}>
                    <td className="py-3 pr-3 font-medium">{conversion.unit}{conversion.id === "base" ? " (base)" : ""}</td>
                    <td className="py-3 pr-3">{conversion.conversionFactor}</td>
                    <td className="py-3 pr-3">{conversion.id === "base" ? "—" : [conversion.isPurchaseUnit && "Purchase", conversion.isSalesUnit && "Sales"].filter(Boolean).join(" / ")}</td>
                    <td className="py-3 pr-3">{conversion.precision}</td>
                    <td className="py-3">{conversion.roundingMode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <form onSubmit={saveUnit} className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <h3 className="font-medium sm:col-span-2">Add or update conversion</h3>
              <label className="text-sm">Unit
                <select value={unit} onChange={(event) => chooseUnit(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2">
                  {units.filter((item) => item !== product.baseUnit).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm">Base units per unit
                <input required type="number" min="0.00000001" step="0.00000001" value={factor} onChange={(event) => setFactor(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
              </label>
              <label className="text-sm">Precision (decimal places)
                <input required type="number" min="0" max="8" value={precision} onChange={(event) => setPrecision(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2" />
              </label>
              <label className="text-sm">Rounding
                <select value={roundingMode} onChange={(event) => setRoundingMode(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2">
                  {roundingModes.map((mode) => <option key={mode} value={mode}>{mode.replace("_", " ")}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={isPurchaseUnit} onChange={(event) => setIsPurchaseUnit(event.target.checked)} />Purchase unit</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={isSalesUnit} onChange={(event) => setIsSalesUnit(event.target.checked)} />Sales unit</label>
              </div>
              <div className="sm:col-span-2"><button disabled={pending} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save conversion"}</button></div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
