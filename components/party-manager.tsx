"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Party = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  isActive: boolean;
};

type PartyForm = Omit<Party, "id" | "isActive">;
type PartyResponse = { items: Party[]; total: number; page: number; pageSize: number };
type Props = { resource: "customers" | "suppliers"; title: string };

const emptyForm: PartyForm = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  return body as T;
}

export function PartyManager({ resource, title }: Props) {
  const [data, setData] = useState<PartyResponse>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState<PartyForm>(emptyForm);
  const [partyToToggle, setPartyToToggle] = useState<Party | null>(null);

  const loadParties = useCallback(async (signal: AbortSignal) => {
    const query = new URLSearchParams({ search, active, page: String(page), pageSize: "20" });
    const response = await fetch(`/api/${resource}?${query}`, { signal });
    setData(await readJson<PartyResponse>(response));
  }, [active, page, refresh, resource, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadParties(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : `Unable to load ${title.toLowerCase()}.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadParties, title]);

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  function startEdit(party: Party) {
    setEditing(party);
    setForm({
      name: party.name,
      phone: party.phone ?? "",
      email: party.email ?? "",
      gstin: party.gstin ?? "",
      addressLine1: party.addressLine1 ?? "",
      city: party.city ?? "",
      state: party.state ?? "",
      pincode: party.pincode ?? "",
    });
    setError("");
    setNotice("");
  }

  async function saveParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editing ? `/api/${resource}/${editing.id}` : `/api/${resource}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await readJson<Party>(response);
      setNotice(`${title.slice(0, -1)} ${editing ? "updated" : "created"}.`);
      resetForm();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to save ${title.toLowerCase()}.`);
    } finally {
      setPending(false);
    }
  }

  function toggleActive(party: Party) {
    setPartyToToggle(party);
  }

  async function confirmToggleActive() {
    if (!partyToToggle) return;
    const party = partyToToggle;
    const action = party.isActive ? "deactivate" : "activate";
    setPartyToToggle(null);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/${resource}/${party.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !party.isActive }),
      });
      await readJson<Party>(response);
      setNotice(`${title.slice(0, -1)} ${action}d.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action} record.`);
    } finally {
      setPending(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const columns = 4;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <ConfirmDialog open={Boolean(partyToToggle)} title={`${partyToToggle?.isActive ? "Deactivate" : "Activate"} ${title.slice(0, -1)}?`} description={partyToToggle ? `${partyToToggle.name} will be ${partyToToggle.isActive ? "inactive" : "active"} for this business unit.` : undefined} confirmLabel={partyToToggle?.isActive ? "Deactivate" : "Activate"} destructive={Boolean(partyToToggle?.isActive)} busy={pending} onCancel={() => setPartyToToggle(null)} onConfirm={() => void confirmToggleActive()} />
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1 text-sm font-medium">
            Search {title.toLowerCase()}
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" placeholder="Name, phone, email or GSTIN" />
          </label>
          <label className="text-sm font-medium">
            Status
            <select value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-gray-300 bg-white p-2.5">
              <option value="all">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr><th className="py-3 pr-4">Name</th><th className="py-3 pr-4">Contact</th><th className="py-3 pr-4">GSTIN</th><th className="py-3 pr-4">Status</th><th className="py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={columns + 1} className="py-8 text-center text-gray-500">Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={columns + 1} className="py-8 text-center text-gray-500">No {title.toLowerCase()} found.</td></tr>
              ) : data.items.map((party) => (
                <tr key={party.id}>
                  <td className="py-3 pr-4 font-medium">
                    {party.name}
                    <span className="mt-1 block text-xs font-normal text-gray-500">{[party.city, party.state].filter(Boolean).join(", ") || "—"}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {party.phone || "—"}
                    {party.email && <span className="mt-1 block text-xs text-gray-500">{party.email}</span>}
                  </td>
                  <td className="py-3 pr-4">{party.gstin || "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${party.isActive ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                      {party.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button type="button" disabled={pending} onClick={() => startEdit(party)} className="mr-3 font-medium text-emerald-900 hover:underline disabled:opacity-50">Edit</button>
                    <button type="button" disabled={pending} onClick={() => void toggleActive(party)} className="font-medium text-gray-600 hover:underline disabled:opacity-50">
                      {party.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-600">
          <span>{data.total} total</span>
          <div className="flex items-center gap-3">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      <form onSubmit={saveParty} className="h-fit space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}</h2>
            <p className="mt-1 text-xs text-gray-500">Records are separate for each business unit.</p>
          </div>
          {editing && <button type="button" onClick={resetForm} className="text-sm text-gray-600 hover:underline">Cancel</button>}
        </div>
        <label className="block text-sm font-medium">
          Name *
          <input required maxLength={120} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <label className="block text-sm font-medium">
            Phone
            <input maxLength={30} value={form.phone ?? ""} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input type="email" maxLength={254} value={form.email ?? ""} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
          </label>
        </div>
        <label className="block text-sm font-medium">
          GSTIN
          <input maxLength={15} value={form.gstin ?? ""} onChange={(event) => setForm((value) => ({ ...value, gstin: event.target.value.toUpperCase() }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5 uppercase" />
        </label>
        <label className="block text-sm font-medium">
          Address
          <input maxLength={200} value={form.addressLine1 ?? ""} onChange={(event) => setForm((value) => ({ ...value, addressLine1: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            City
            <input maxLength={100} value={form.city ?? ""} onChange={(event) => setForm((value) => ({ ...value, city: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
          </label>
          <label className="block text-sm font-medium">
            State
            <input maxLength={100} value={form.state ?? ""} onChange={(event) => setForm((value) => ({ ...value, state: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Pincode
          <input maxLength={12} value={form.pincode ?? ""} onChange={(event) => setForm((value) => ({ ...value, pincode: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
        </label>
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-emerald-900 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
          {pending ? "Saving…" : editing ? "Save changes" : `Create ${title.slice(0, -1).toLowerCase()}`}
        </button>
      </form>
    </div>
  );
}
