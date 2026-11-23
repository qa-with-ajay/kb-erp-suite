"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Location = { id: string; name: string; code: string; isActive: boolean };
type ResponseData = { items: Location[]; total: number; page: number; pageSize: number };

export function LocationManager({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<ResponseData>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Location | null>(null);
  const [name, setName] = useState("Warehouse");
  const [code, setCode] = useState("WAREHOUSE");

  const loadLocations = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({ search, active, page: String(page), pageSize: "20" });
    const response = await fetch(`/api/inventory/locations?${query}`, { signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load stock locations.");
    setData(body as ResponseData);
  }, [active, page, refresh, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadLocations(controller.signal)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load stock locations."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadLocations]);

  function resetForm() {
    setEditing(null);
    setName("Warehouse");
    setCode("WAREHOUSE");
  }

  function startEdit(item: Location) {
    setEditing(item);
    setName(item.name);
    setCode(item.code);
    setError(null);
    setNotice(null);
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(editing ? `/api/inventory/locations/${editing.id}` : "/api/inventory/locations", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save stock location.");
      setNotice(`Stock location ${editing ? "updated" : "created"}.`);
      resetForm();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save stock location.");
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(item: Location) {
    const action = item.isActive ? "deactivate" : "activate";
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${item.name}? Inactive locations will no longer appear in stock-entry and product stock views.`)) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inventory/locations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to ${action} stock location.`);
      setNotice(`Stock location ${action}d.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action} stock location.`);
    } finally {
      setPending(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-52 flex-1 text-sm font-medium">Search
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or code" className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
          </label>
          <label className="text-sm font-medium">Status
            <select value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
              <option value="all">All</option><option value="true">Active</option><option value="false">Inactive</option>
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500"><tr><th className="py-3 pr-4 font-medium">Location</th><th className="py-3 pr-4 font-medium">Code</th><th className="py-3 pr-4 font-medium">Status</th>{canManage && <th className="py-3 text-right font-medium">Actions</th>}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={canManage ? 4 : 3} className="py-8 text-center text-gray-500">Loading…</td></tr>
                : data.items.length === 0 ? <tr><td colSpan={canManage ? 4 : 3} className="py-8 text-center text-gray-500">No stock locations found.</td></tr>
                : data.items.map((item) => <tr key={item.id}>
                  <td className="py-3 pr-4 font-medium">{item.name}</td><td className="py-3 pr-4 font-mono text-xs">{item.code}</td>
                  <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs ${item.isActive ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{item.isActive ? "Active" : "Inactive"}</span></td>
                  {canManage && <td className="py-3 text-right whitespace-nowrap"><button disabled={pending} onClick={() => startEdit(item)} className="mr-3 font-medium text-emerald-900 hover:underline disabled:opacity-50">Edit</button><button disabled={pending} onClick={() => toggleActive(item)} className="font-medium text-gray-600 hover:underline disabled:opacity-50">{item.isActive ? "Deactivate" : "Activate"}</button></td>}
                </tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
          <span>{data.total} total</span><div className="flex items-center gap-3">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>
      {canManage && <form onSubmit={saveLocation} className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{editing ? "Edit stock location" : "Add stock location"}</h2>
        <p className="mt-1 text-xs text-gray-500">Create locations such as Warehouse and Showroom. Existing stock history is retained when a location is deactivated.</p>
        <label className="mt-4 block text-sm font-medium">Location name
          <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <label className="mt-4 block text-sm font-medium">Location code
          <input required maxLength={40} pattern="[A-Za-z0-9_-]+" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <div className="mt-5 flex gap-2">
          <button disabled={pending} className="rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : editing ? "Save changes" : "Add location"}</button>
          {editing && <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-4 py-2.5">Cancel</button>}
        </div>
      </form>}
    </div>
  );
}
