"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";

type Option = { id: string; name: string };
type ProductData = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  productType: "STANDARD" | "PANEL";
  baseUnit: string;
  purchasePrice: string;
  sellingPrice: string;
  gstPercentage: string;
  minimumStock: string;
  barcode: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  brandId: string | null;
  isActive: boolean;
};
type FormValues = Omit<ProductData, "id" | "isActive" | "purchasePrice" | "sellingPrice" | "gstPercentage" | "minimumStock" | "description" | "barcode" | "imageUrl" | "categoryId" | "brandId"> & {
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  gstPercentage: string;
  minimumStock: string;
  barcode: string;
  imageUrl: string;
  categoryId: string;
  brandId: string;
};
const emptyValues: FormValues = {
  name: "", sku: "", description: "", productType: "STANDARD", baseUnit: "PCS",
  purchasePrice: "0", sellingPrice: "0", gstPercentage: "0", minimumStock: "0",
  barcode: "", imageUrl: "", categoryId: "", brandId: "",
};
const units = ["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"];

type Props = { productId?: string };

export function ProductForm({ productId }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const categoryRequest = fetch("/api/inventory/categories?active=true&pageSize=100", { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load categories.");
      return body.items as Option[];
    });
    const brandRequest = fetch("/api/inventory/brands?active=true&pageSize=100", { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load brands.");
      return body.items as Option[];
    });
    const productRequest = productId
      ? fetch(`/api/inventory/products/${productId}`, { signal: controller.signal }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load product.");
        return body as ProductData;
      })
      : Promise.resolve(null);

    Promise.all([categoryRequest, brandRequest, productRequest]).then(([categoryItems, brandItems, product]) => {
      setCategories(categoryItems);
      setBrands(brandItems);
      if (product) setValues({
        name: product.name,
        sku: product.sku,
        description: product.description ?? "",
        productType: product.productType,
        baseUnit: product.baseUnit,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        gstPercentage: product.gstPercentage,
        minimumStock: product.minimumStock,
        barcode: product.barcode ?? "",
        imageUrl: product.imageUrl ?? "",
        categoryId: product.categoryId ?? "",
        brandId: product.brandId ?? "",
      });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load product form.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [productId]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(productId ? `/api/inventory/products/${productId}` : "/api/inventory/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          description: values.description || null,
          barcode: values.barcode || null,
          imageUrl: values.imageUrl || null,
          categoryId: values.categoryId || null,
          brandId: values.brandId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save product.");
      router.push(`/inventory/products/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save product.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="min-h-screen p-6 text-sm text-gray-600">Loading product…</main>;
  if (error) return <main className="min-h-screen p-6"><Breadcrumbs items={[{ label: "Products", href: "/inventory/products" }, { label: productId ? "Edit product" : "Add product" }]} /><p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p></main>;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs items={[{ label: "Products", href: "/inventory/products" }, { label: productId ? "Edit product" : "Add product" }]} />
        <h1 className="text-2xl font-bold">{productId ? "Edit product" : "Add product"}</h1>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <form onSubmit={submit} className="grid gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium">Product name
          <input required maxLength={160} value={values.name} onChange={(event) => update("name", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">SKU / product code
          <input required maxLength={80} value={values.sku} onChange={(event) => update("sku", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">Product type
          <select value={values.productType} onChange={(event) => setValues((current) => ({ ...current, productType: event.target.value === "PANEL" ? "PANEL" : "STANDARD", baseUnit: event.target.value === "PANEL" ? "SQFT" : current.baseUnit }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="STANDARD">Standard</option><option value="PANEL">Panel</option>
          </select>
        </label>
        <label className="text-sm font-medium">Base unit
          <select value={values.baseUnit} disabled={values.productType === "PANEL"} onChange={(event) => update("baseUnit", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 disabled:bg-gray-100">
            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          {values.productType === "PANEL" && <span className="mt-1 block text-xs text-gray-500">Panel inventory uses SQFT as its base unit.</span>}
        </label>
        <label className="text-sm font-medium">Category
          <select value={values.categoryId} onChange={(event) => update("categoryId", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Brand
          <select value={values.brandId} onChange={(event) => update("brandId", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="">No brand</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Purchase price
          <input type="number" min="0" step="0.01" required value={values.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">Selling price
          <input type="number" min="0" step="0.01" required value={values.sellingPrice} onChange={(event) => update("sellingPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">GST percentage
          <input type="number" min="0" max="100" step="0.01" value={values.gstPercentage} onChange={(event) => update("gstPercentage", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">Minimum stock ({values.baseUnit})
          <input type="number" min="0" step="0.0001" value={values.minimumStock} onChange={(event) => update("minimumStock", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">Barcode (optional)
          <input maxLength={100} value={values.barcode ?? ""} onChange={(event) => update("barcode", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">Product image path or URL (optional)
          <input maxLength={500} value={values.imageUrl ?? ""} onChange={(event) => update("imageUrl", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium md:col-span-2">Description
          <textarea maxLength={2000} rows={4} value={values.description ?? ""} onChange={(event) => update("description", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <div className="flex gap-3 md:col-span-2">
          <button disabled={saving} className="rounded-lg bg-emerald-900 px-5 py-2.5 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save product"}</button>
          <Link href={productId ? `/inventory/products/${productId}` : "/inventory/products"} className="rounded-lg border border-gray-300 px-5 py-2.5">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
