"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProductItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  barcodeType: "INTERNAL" | "MANUFACTURER";
  productType: "STANDARD" | "MATERIAL";
  baseUnit: string;
  sellingPrice: string;
  gstPercentage: string;
  isActive: boolean;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  _count: { variants: number };
};

type Option = { id: string; name: string };
type Props = { canManage: boolean };

export function ProductList({ canManage }: Props) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [active, setActive] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productType, setProductType] = useState("");
  const [sort, setSort] = useState("nameAsc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({
      search: debouncedSearch,
      active,
      page: String(page),
      pageSize: "10",
      ...(categoryId ? { categoryId } : {}),
      ...(brandId ? { brandId } : {}),
      ...(productType ? { productType } : {}),
      sort,
    });
    const response = await fetch(`/api/inventory/products?${query}`, { signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load products.");
    setItems(body.items);
    setTotal(body.total);
  }, [active, brandId, categoryId, debouncedSearch, page, productType, sort]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadProducts(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load products.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/inventory/categories?active=true&pageSize=100", { signal: controller.signal }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load categories.");
        return body;
      }),
      fetch("/api/inventory/brands?active=true&pageSize=100", { signal: controller.signal }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load brands.");
        return body;
      }),
    ]).then(([categoryData, brandData]) => {
      setCategories(categoryData.items);
      setBrands(brandData.items);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load filters.");
    });
    return () => controller.abort();
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / 10));
  const resetPage = () => setPage(1);
  const hasActiveFilters = Boolean(search || active !== "all" || categoryId || brandId || productType);
  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setActive("all");
    setCategoryId("");
    setBrandId("");
    setProductType("");
    setPage(1);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-sm font-medium">
          Search
          <input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Name, SKU, or barcode" className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="text-sm font-medium">
          Status
          <select value={active} onChange={(event) => { setActive(event.target.value); resetPage(); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="all">All</option><option value="true">Active</option><option value="false">Inactive</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Type
          <select value={productType} onChange={(event) => { setProductType(event.target.value); resetPage(); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="">All types</option><option value="STANDARD">Standard</option><option value="MATERIAL">Material</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Sort
          <select value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="nameAsc">Name A–Z</option><option value="nameDesc">Name Z–A</option><option value="skuAsc">SKU</option>
            <option value="priceAsc">Price low–high</option><option value="priceDesc">Price high–low</option><option value="newest">Newest</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Category
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); resetPage(); }} className="mt-1 block max-w-48 rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="">All categories</option>{categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Brand
          <select value={brandId} onChange={(event) => { setBrandId(event.target.value); resetPage(); }} className="mt-1 block max-w-48 rounded-lg border border-gray-300 bg-white p-2.5">
            <option value="">All brands</option>{brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        {hasActiveFilters && <button type="button" onClick={clearFilters} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Clear filters</button>}
        {canManage && <div className="flex flex-wrap gap-2"><Link href="/inventory/import" className="rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">Bulk import</Link><Link href="/inventory/products/new" className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Add product</Link></div>}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="py-3 pr-4 font-medium">Product</th><th className="py-3 pr-4 font-medium">Category / Brand</th>
              <th className="py-3 pr-4 font-medium">Type / Processing / Unit</th><th className="py-3 pr-4 font-medium">Selling price</th>
              <th className="py-3 pr-4 font-medium">Variants</th><th className="py-3 pr-4 font-medium">Status</th><th className="py-3 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading products…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">{hasActiveFilters ? "No products match these filters. Try changing or clearing your filters." : "No products found. Add your first product to get started."}</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-4"><p className="font-medium">{item.name}</p><p className="text-xs text-gray-500">{item.sku}</p><p className="text-xs text-gray-400">{item.barcode ? `${item.barcode} · ${item.barcodeType === "MANUFACTURER" ? "Manufacturer" : "KB"}` : "No barcode"}</p></td>
                <td className="py-3 pr-4">{item.category?.name ?? "—"} / {item.brand?.name ?? "—"}</td>
                <td className="py-3 pr-4">{item.productType === "PANEL" ? "Panel" : "Standard"} / {item.baseUnit}</td>
                <td className="py-3 pr-4">{item.sellingPrice} <span className="text-xs text-gray-500">+ {item.gstPercentage}% GST</span></td>
                <td className="py-3 pr-4">{item._count.variants}</td>
                <td className="py-3 pr-4">{item.isActive ? "Active" : "Inactive"}</td>
                <td className="py-3 text-right"><Link className="font-medium text-emerald-900 hover:underline" href={`/inventory/products/${item.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
        <span>{total} products</span>
        <div className="flex items-center gap-3">
          <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </section>
  );
}
