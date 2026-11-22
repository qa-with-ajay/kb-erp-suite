"use client";

import Link from "next/link";
import { useState } from "react";

type PreviewRow = {
  rowNumber: number; sku: string; name: string; action: "CREATE" | "UPDATE";
  openingQuantity: string; openingAlreadyRecorded: boolean;
};
type Issue = { rowNumber: number; field: string; message: string };
type Preview = {
  rows: PreviewRow[];
  issues: Issue[];
  summary: { totalRows: number; validRows: number; invalidRows: number; newProducts: number; existingProducts: number; openingStockRows: number; openingStockAlreadyRecorded: number };
};
type ImportResult = { totalRows: number; created: number; updated: number; openingStockCreated: number; openingStockSkipped: number };

export function InventoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: "preview" | "commit") {
    if (!file) { setError("Choose a CSV file first."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("updateExisting", String(updateExisting));
      const response = await fetch(mode === "preview" ? "/api/inventory/import/validate" : "/api/inventory/import/commit", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        if (mode === "commit" && body.issues) {
          setPreview((current) => current ? { ...current, issues: body.issues, summary: body.summary ?? current.summary } : current);
        }
        throw new Error(body.error ?? "Inventory import failed.");
      }
      if (mode === "preview") setPreview(body as Preview);
      else { setResult(body as ImportResult); setPreview(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to process the CSV file.");
    } finally { setLoading(false); }
  }

  const canCommit = Boolean(preview && preview.summary.validRows > 0 && preview.summary.invalidRows === 0);

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-6">
        <Link href="/inventory/products" className="text-sm text-emerald-800 hover:underline">← Back to products</Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Bulk inventory import</h1>
        <p className="mt-1 text-sm text-gray-600">Upload a CSV to create products, update matching SKUs and optionally record opening stock.</p>
      </header>

      <section className="max-w-5xl space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">1. Download the template</h2><p className="mt-1 text-sm text-gray-600">Use the provided column names. Maximum 500 product rows and 1 MB per file.</p></div>
          <a href="/api/inventory/import/template" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Download CSV template</a>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h2 className="font-semibold">2. Upload your CSV</h2>
          <input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }} className="mt-3 block w-full rounded-lg border border-gray-300 p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2" />
          {file && <p className="mt-2 text-xs text-gray-500">Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={updateExisting} onChange={(event) => { setUpdateExisting(event.target.checked); setPreview(null); }} className="mt-0.5" />
            <span><strong>Update existing products matching SKU</strong><span className="block text-xs text-gray-500">Off by default. When enabled, product details are updated; existing opening stock is never added again.</span></span>
          </label>
          <button type="button" disabled={!file || loading} onClick={() => submit("preview")} className="mt-4 rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Please wait…" : "Validate and preview"}</button>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {preview && <>
          <div className="border-t border-gray-100 pt-5">
            <h2 className="font-semibold">3. Review validation</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Rows", preview.summary.totalRows], ["Valid", preview.summary.validRows],
                ["Invalid", preview.summary.invalidRows], ["New / existing", `${preview.summary.newProducts} / ${preview.summary.existingProducts}`],
              ].map(([label, value]) => <div key={label} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
            </div>
            <p className="mt-3 text-sm text-gray-600">Opening stock rows: {preview.summary.openingStockRows}. Already initialized and therefore skipped: {preview.summary.openingStockAlreadyRecorded}.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead className="border-b text-xs text-gray-500"><tr><th className="py-2">Row</th><th>SKU</th><th>Product</th><th>Action</th><th>Opening qty</th></tr></thead>
                <tbody>{preview.rows.slice(0, 50).map((row) => <tr key={row.rowNumber} className="border-b border-gray-100"><td className="py-2">{row.rowNumber}</td><td>{row.sku}</td><td>{row.name}</td><td>{row.action}</td><td>{row.openingQuantity}{row.openingAlreadyRecorded ? " (already recorded)" : ""}</td></tr>)}</tbody>
              </table>
              {preview.rows.length > 50 && <p className="mt-2 text-xs text-gray-500">Showing first 50 of {preview.rows.length} rows.</p>}
            </div>
            {preview.issues.length > 0 && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <h3 className="font-semibold text-red-900">Please correct these errors ({preview.issues.length})</h3>
              <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-auto pl-5 text-sm text-red-800">{preview.issues.map((issue, index) => <li key={index}>Row {issue.rowNumber} · {issue.field}: {issue.message}</li>)}</ul>
            </div>}
            <button type="button" disabled={!canCommit || loading} onClick={() => submit("commit")} className="mt-4 rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Confirm and import {preview.summary.validRows} products</button>
            {!canCommit && <p className="mt-2 text-xs text-gray-500">Import is enabled only when every row passes validation.</p>}
          </div>
        </>}

        {result && <div className="border-t border-gray-100 pt-5">
          <h2 className="font-semibold text-emerald-900">Import completed</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[[ "Created", result.created ], [ "Updated", result.updated ], [ "Opening stock movements", result.openingStockCreated ], [ "Opening stock skipped", result.openingStockSkipped ]].map(([label, value]) => <div key={label} className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-gray-600">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
          </div>
          <button type="button" onClick={() => { setFile(null); setResult(null); setPreview(null); }} className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Import another file</button>
        </div>}
      </section>
    </main>
  );
}
