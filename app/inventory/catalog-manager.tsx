"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

type CatalogResponse = {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
};

type Props = {
  resource: "categories" | "brands";
  title: string;
  canManage: boolean;
  hasDescription?: boolean;
};

export function CatalogManager({ resource, title, canManage, hasDescription = false }: Props) {
  const singularTitle = resource === "categories" ? "Category" : "Brand";
  const [data, setData] = useState<CatalogResponse>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const loadItems = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({
      search,
      active,
      page: String(page),
      pageSize: "10",
    });
    const response = await fetch(`/api/inventory/${resource}?${query}`, { signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `Unable to load ${title.toLowerCase()}.`);
    setData(body as CatalogResponse);
  }, [active, page, refresh, resource, search, title]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadItems(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadItems]);

  function startEdit(item: CatalogItem) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditing(null);
    setName("");
    setDescription("");
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editing ? `/api/inventory/${resource}/${editing.id}` : `/api/inventory/${resource}`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            ...(hasDescription ? { description } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save changes.");
      setNotice(`${title} ${editing ? "updated" : "created"}.`);
      resetForm();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save changes.");
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(item: CatalogItem) {
    const action = item.isActive ? "deactivate" : "activate";
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${item.name}?`)) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inventory/${resource}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to ${action} ${title.toLowerCase()}.`);
      setNotice(`${singularTitle} ${action}d.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action} ${title.toLowerCase()}.`);
    } finally {
      setPending(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-52 flex-1 text-sm font-medium">
            Search
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
              placeholder={`Search ${title.toLowerCase()}`}
            />
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              value={active}
              onChange={(event) => { setActive(event.target.value); setPage(1); }}
              className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5"
            >
              <option value="all">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="py-3 pr-4 font-medium">Name</th>
                {hasDescription && <th className="py-3 pr-4 font-medium">Description</th>}
                <th className="py-3 pr-4 font-medium">Status</th>
                {canManage && <th className="py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={canManage ? (hasDescription ? 4 : 3) : (hasDescription ? 3 : 2)} className="py-8 text-center text-gray-500">Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={canManage ? (hasDescription ? 4 : 3) : (hasDescription ? 3 : 2)} className="py-8 text-center text-gray-500">No {title.toLowerCase()} found.</td></tr>
              ) : data.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4 font-medium">{item.name}</td>
                  {hasDescription && <td className="max-w-sm truncate py-3 pr-4 text-gray-600">{item.description || "—"}</td>}
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${item.isActive ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-3 text-right">
                      <button disabled={pending} onClick={() => startEdit(item)} className="mr-3 font-medium text-emerald-900 hover:underline disabled:opacity-50">Edit</button>
                      <button disabled={pending} onClick={() => toggleActive(item)} className="font-medium text-gray-600 hover:underline disabled:opacity-50">
                        {item.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
          <span>{data.total} total</span>
          <div className="flex items-center gap-3">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      {canManage && (
        <form onSubmit={saveItem} className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">{editing ? `Edit ${singularTitle}` : `Add ${singularTitle}`}</h2>
          <label className="mt-4 block text-sm font-medium">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
            />
          </label>
          {hasDescription && (
            <label className="mt-4 block text-sm font-medium">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                rows={4}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2.5"
              />
            </label>
          )}
          <div className="mt-5 flex gap-2">
            <button disabled={pending} className="rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
              {pending ? "Saving…" : editing ? "Save changes" : `Add ${singularTitle}`}
            </button>
            {editing && <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-4 py-2.5">Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}
