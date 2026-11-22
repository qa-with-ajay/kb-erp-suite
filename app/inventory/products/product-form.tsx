"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BarcodeScanner } from "@/components/barcode-scanner";

type Option = { id: string; name: string };
type LocationOption = { id: string; name: string };

type OpeningStockEntry = {
  locationId: string;
  quantity: string;
  unitCost: string;
};

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
  barcodeType: "INTERNAL" | "MANUFACTURER";
  imageUrl: string | null;
  categoryId: string | null;
  brandId: string | null;
  isActive: boolean;
};
type FormValues = Omit<
  ProductData,
  | "id"
  | "isActive"
  | "purchasePrice"
  | "sellingPrice"
  | "gstPercentage"
  | "minimumStock"
  | "description"
  | "barcode"
  | "barcodeType"
  | "imageUrl"
  | "categoryId"
  | "brandId"
> & {
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  gstPercentage: string;
  minimumStock: string;
  barcode: string;
  barcodeType: "INTERNAL" | "MANUFACTURER";
  imageUrl: string;
  categoryId: string;
  brandId: string;
};

const emptyValues: FormValues = {
  name: "",
  sku: "",
  description: "",
  productType: "STANDARD",
  baseUnit: "PCS",
  purchasePrice: "0",
  sellingPrice: "0",
  gstPercentage: "0",
  minimumStock: "0",
  barcode: "",
  barcodeType: "INTERNAL",
  imageUrl: "",
  categoryId: "",
  brandId: "",
};

const units = [
  "PCS",
  "SQFT",
  "BOX",
  "RFT",
  "ROLL",
  "METER",
  "KG",
  "LITRE",
  "BUNDLE",
  "SET",
];

type Props = { productId?: string };

export function ProductForm({ productId }: Props) {
  const router = useRouter();

  const [values, setValues] = useState<FormValues>(emptyValues);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [openingStock, setOpeningStock] = useState<OpeningStockEntry[]>([
    {
      locationId: "",
      quantity: "0",
      unitCost: "0",
    },
  ]);

  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const categoryRequest = fetch(
      "/api/inventory/categories?active=true&pageSize=100",
      { signal: controller.signal }
    ).then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load categories.");
      }
      return body.items as Option[];
    });
    const brandRequest = fetch(
      "/api/inventory/brands?active=true&pageSize=100",
      { signal: controller.signal }
    ).then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load brands.");
      }

      return body.items as Option[];
    });

    // Assumes the locations API returns { items: [{ id, name }] }.
    const locationRequest = fetch(
      "/api/inventory/locations?active=true&pageSize=100",
      { signal: controller.signal }
    ).then(async (response) => {
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load stock locations.");
      }

      return body.items as LocationOption[];
    });

    const productRequest = productId
      ? fetch(`/api/inventory/products/${productId}`, {
        signal: controller.signal,
      }).then(async (response) => {
        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load product.");
        }

        return body as ProductData;
      })
      : Promise.resolve(null);

    Promise.all([
      categoryRequest,
      brandRequest,
      locationRequest,
      productRequest,
    ])
      .then(([categoryItems, brandItems, locationItems, product]) => {
        setCategories(categoryItems);
        setBrands(brandItems);
        setLocations(locationItems);

        if (product) {
          setValues({
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
            barcodeType:
              product.barcodeType ??
              (product.barcode ? "MANUFACTURER" : "INTERNAL"),
            imageUrl: product.imageUrl ?? "",
            categoryId: product.categoryId ?? "",
            brandId: product.brandId ?? "",
          });
        } else if (locationItems.length === 1) {
          setOpeningStock([
            {
              locationId: locationItems[0].id,
              quantity: "0",
              unitCost: "0",
            },
          ]);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load product form."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [productId]);

  function update<K extends keyof FormValues>(
    key: K,
    value: FormValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateOpeningStock(
    index: number,
    key: keyof OpeningStockEntry,
    value: string
  ) {
    setOpeningStock((current) =>
      current.map((entry, i) =>
        i === index ? { ...entry, [key]: value } : entry
      )
    );
  }

  function addOpeningStockLocation() {
    setOpeningStock((current) => [
      ...current,
      {
        locationId: "",
        quantity: "0",
        unitCost: values.purchasePrice || "0",
      },
    ]);
  }

  function removeOpeningStockLocation(index: number) {
    setOpeningStock((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  const openingStockTotal = openingStock.reduce(
    (total, entry) => total + (Number(entry.quantity) || 0),
    0
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const positiveEntries = openingStock.filter(
        (entry) => Number(entry.quantity) > 0
      );

      if (!productId) {
        const selectedLocations = positiveEntries.map(
          (entry) => entry.locationId
        );

        if (positiveEntries.some((entry) => !entry.locationId)) {
          throw new Error(
            "Please select a stock location for every positive opening quantity."
          );
        }

        if (
          new Set(selectedLocations).size !== selectedLocations.length
        ) {
          throw new Error(
            "Each stock location can be entered only once."
          );
        }

        if (
          positiveEntries.some(
            (entry) =>
              !Number.isFinite(Number(entry.quantity)) ||
              Number(entry.quantity) < 0 ||
              !Number.isFinite(Number(entry.unitCost)) ||
              Number(entry.unitCost) < 0
          )
        ) {
          throw new Error("Please enter valid opening stock quantities and costs.");
        }
      }

      const response = await fetch(
        productId
          ? `/api/inventory/products/${productId}`
          : "/api/inventory/products",
        {
          method: productId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            description: values.description || null,
            barcode: values.barcode || null,
            barcodeType: values.barcodeType,
            imageUrl: values.imageUrl || null,
            categoryId: values.categoryId || null,
            brandId: values.brandId || null,

            ...(productId
              ? {}
              : {
                openingStock: positiveEntries.map((entry) => ({
                  locationId: entry.locationId,
                  quantity: entry.quantity,
                  unitCost: entry.unitCost,
                })),
              }),
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to save product.");
      }

      router.push(`/inventory/products/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 text-sm text-gray-600">
        Loading product…
      </main>
    );
  }

  if (error && !categories.length && !productId) {
    return (
      <main className="min-h-screen p-6">
        <Breadcrumbs
          items={[
            { label: "Products", href: "/inventory/products" },
            { label: "Add product" },
          ]}
        />
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Products", href: "/inventory/products" },
            { label: productId ? "Edit product" : "Add product" },
          ]}
        />
        <h1 className="text-2xl font-bold">
          {productId ? "Edit product" : "Add product"}
        </h1>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={submit}
        className="grid gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2"
      >
        <label className="text-sm font-medium">
          Product name
          <input
            required
            maxLength={160}
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          SKU / product code
          <input
            required
            maxLength={80}
            value={values.sku}
            onChange={(event) => update("sku", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          Product type
          <select
            value={values.productType}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                productType:
                  event.target.value === "PANEL" ? "PANEL" : "STANDARD",
                baseUnit:
                  event.target.value === "PANEL"
                    ? "SQFT"
                    : current.baseUnit,
              }))
            }
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
          >
            <option value="STANDARD">Standard</option>
            <option value="PANEL">Panel</option>
          </select>
        </label>

        <label className="text-sm font-medium">
          Base unit
          <select
            value={values.baseUnit}
            onChange={(event) => update("baseUnit", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
          >
            {units.filter((unit) => values.productType !== "PANEL" || unit === "PCS" || unit === "SQFT").map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          {values.productType === "PANEL" && (
            <span className="mt-1 block text-xs text-gray-500">
              Use PCS for selling whole sheets, or SQFT for cut-to-size stock. The normal sales screen sells full PCS units.
            </span>
          )}
        </label>

        <label className="text-sm font-medium">
          Category
          <select
            value={values.categoryId}
            onChange={(event) => update("categoryId", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
          >
            <option value="">No category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Brand
          <select
            value={values.brandId}
            onChange={(event) => update("brandId", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
          >
            <option value="">No brand</option>
            {brands.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Purchase price
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={values.purchasePrice}
            onChange={(event) => update("purchasePrice", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          Selling price
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={values.sellingPrice}
            onChange={(event) => update("sellingPrice", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          GST percentage
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={values.gstPercentage}
            onChange={(event) => update("gstPercentage", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium">
          Minimum stock ({values.baseUnit})
          <input
            type="number"
            min="0"
            step="0.0001"
            value={values.minimumStock}
            onChange={(event) => update("minimumStock", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        {!productId && (
          <section className="space-y-4 rounded-xl border border-gray-200 p-4 md:col-span-2">
            <div>
              <h2 className="font-semibold text-gray-900">
                Inventory & Opening Stock
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter the initial stock available at each location.
                You can also save the product with zero stock.
              </p>
            </div>

            {openingStock.map((entry, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg bg-gray-50 p-3 md:grid-cols-4"
              >
                <label className="text-sm font-medium">
                  Stock location
                  <select
                    required={Number(entry.quantity) > 0}
                    value={entry.locationId}
                    onChange={(event) =>
                      updateOpeningStock(
                        index,
                        "locationId",
                        event.target.value
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
                  >
                    <option value="">Select location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium">
                  Opening quantity ({values.baseUnit})
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={entry.quantity}
                    onChange={(event) =>
                      updateOpeningStock(
                        index,
                        "quantity",
                        event.target.value
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
                  />
                </label>

                <label className="text-sm font-medium">
                  Unit cost (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry.unitCost}
                    onChange={(event) =>
                      updateOpeningStock(
                        index,
                        "unitCost",
                        event.target.value
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={openingStock.length === 1}
                    onClick={() => removeOpeningStockLocation(index)}
                    className="rounded-lg border border-red-200 px-3 py-2.5 text-sm text-red-700 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addOpeningStockLocation}
              className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-medium text-emerald-900"
            >
              + Add another location
            </button>

            <div className="flex justify-between border-t pt-3 text-sm">
              <span className="font-medium text-gray-600">
                Total opening stock
              </span>
              <span className="font-bold text-gray-900">
                {openingStockTotal} {values.baseUnit}
              </span>
            </div>
          </section>
        )}

        <label className="text-sm font-medium">
          Barcode source
          <select
            value={values.barcodeType}
            onChange={(event) => {
              const barcodeType =
                event.target.value === "MANUFACTURER"
                  ? "MANUFACTURER"
                  : "INTERNAL";

              setValues((current) => ({
                ...current,
                barcodeType,
                barcode:
                  barcodeType === "INTERNAL" ? "" : current.barcode,
              }));
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5"
          >
            <option value="INTERNAL">
              Generate KB barcode automatically
            </option>
            <option value="MANUFACTURER">
              Use manufacturer barcode
            </option>
          </select>
        </label>

        {values.barcodeType === "INTERNAL" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Automatic KB barcode</p>
            <p className="mt-1 text-xs">
              A unique internal Code 128 barcode will be generated when you
              save this product. It is not a GS1/GTIN manufacturer barcode.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <BarcodeScanner
                compact
                autoFocus={false}
                placeholder="Scan manufacturer barcode"
                onScan={(code) => update("barcode", code)}
              />
            </div>

            <label className="block text-sm font-medium">
              Manufacturer barcode
              <input
                required
                maxLength={100}
                value={values.barcode}
                onChange={(event) => update("barcode", event.target.value)}
                placeholder="Scan or enter barcode value"
                className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
              />
            </label>
          </div>
        )}

        <label className="text-sm font-medium">
          Product image path or URL (optional)
          <input
            maxLength={500}
            value={values.imageUrl ?? ""}
            onChange={(event) => update("imageUrl", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <label className="text-sm font-medium md:col-span-2">
          Description
          <textarea
            maxLength={2000}
            rows={4}
            value={values.description ?? ""}
            onChange={(event) => update("description", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
          />
        </label>

        <div className="flex gap-3 md:col-span-2">
          <button
            disabled={saving}
            className="rounded-lg bg-emerald-900 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save product"}
          </button>

          <Link
            href={
              productId
                ? `/inventory/products/${productId}`
                : "/inventory/products"
            }
            className="rounded-lg border border-gray-300 px-5 py-2.5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

