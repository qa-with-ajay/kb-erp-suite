"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Permission = { code: string; description: string };
type Role = { id: string; code: string; name: string; scope: "GROUP" | "BUSINESS_UNIT"; isSystem: boolean; isActive: boolean; permissionCodes: string[]; assignedUsers: number };
type RolePayload = { roles: Role[]; permissions: Permission[] };
const blank = { name: "", scope: "BUSINESS_UNIT" as "GROUP" | "BUSINESS_UNIT", permissionCodes: [] as string[] };

export function AdminRolesManager() {
  const [data, setData] = useState<RolePayload>({ roles: [], permissions: [] });
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/roles", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load roles.");
      setData(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load roles.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const permissionsByArea = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const permission of data.permissions) {
      const area = permission.code.split(".")[0];
      (groups[area] ??= []).push(permission);
    }
    return Object.entries(groups);
  }, [data.permissions]);

  function reset() { setEditingId(null); setForm(blank); setError(""); setNotice(""); }
  function edit(role: Role) {
    if (role.isSystem) return;
    setEditingId(role.id);
    setForm({ name: role.name, scope: role.scope, permissionCodes: role.permissionCodes });
    setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function togglePermission(code: string) {
    setForm((current) => ({ ...current, permissionCodes: current.permissionCodes.includes(code) ? current.permissionCodes.filter((item) => item !== code) : [...current.permissionCodes, code] }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(editingId ? `/api/admin/roles/${editingId}` : "/api/admin/roles", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save role.");
      const successMessage = editingId ? "Role permissions updated." : "Custom role created."; reset(); setNotice(successMessage); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save role."); }
    finally { setSaving(false); }
  }
  async function toggleStatus(role: Role) {
    try {
      const response = await fetch(`/api/admin/roles/${role.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !role.isActive }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update role.");
      setNotice(`${role.name} ${role.isActive ? "deactivated" : "activated"}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update role."); }
  }

  return <div className="admin-users">
    <section className="admin-users__form-card">
      <div className="admin-users__section-heading">
        <div><h2>{editingId ? "Edit custom role" : "Create custom role"}</h2><p>Built-in roles are protected. Custom roles can be tailored to your operating structure.</p></div>
        {editingId && <button type="button" className="admin-users__secondary-button" onClick={reset}>Cancel edit</button>}
      </div>
      <form className="admin-users__form" onSubmit={submit}>
        <div className="admin-users__fields">
          <label className="admin-users__field"><span>Role name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={80} required placeholder="e.g. Sales Supervisor" /></label>
          <label className="admin-users__field"><span>Role scope</span><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as "GROUP" | "BUSINESS_UNIT" })} disabled={!!editingId}><option value="BUSINESS_UNIT">Business unit – assigned units only</option><option value="GROUP">Group – organization-wide</option></select><small>Scope cannot be changed after role creation.</small></label>
        </div>
        <div className="admin-users__permission-picker">
          <div className="admin-users__permission-heading"><strong>Permissions</strong><span>{form.permissionCodes.length} selected</span></div>
          {permissionsByArea.map(([area, permissions]) => <div className="admin-users__permission-group" key={area}>
            <h3>{area.replaceAll("_", " ")}</h3>
            <div className="admin-users__permission-grid">
              {permissions.map((permission) => <label key={permission.code} className="admin-users__permission-option"><input type="checkbox" checked={form.permissionCodes.includes(permission.code)} onChange={() => togglePermission(permission.code)} /><span><strong>{permission.code}</strong><small>{permission.description}</small></span></label>)}
            </div>
          </div>)}
        </div>
        {error && <p className="admin-users__message admin-users__message--error" role="alert">{error}</p>}
        {notice && <p className="admin-users__message admin-users__message--success" role="status">{notice}</p>}
        <div className="admin-users__form-actions"><button className="admin-users__primary-button" type="submit" disabled={saving || form.permissionCodes.length === 0}>{saving ? "Saving…" : editingId ? "Save role" : "Create role"}</button><span className="admin-users__hint">Assign custom roles to users from User management.</span></div>
      </form>
    </section>

    <section className="admin-users__list-card">
      <div className="admin-users__section-heading"><div><h2>Available roles</h2><p>System roles and custom roles configured for the ERP.</p></div></div>
      {loading ? <p className="admin-users__empty">Loading roles…</p> : <div className="admin-users__role-grid">
        {data.roles.map((role) => <article className="admin-users__role-card" key={role.id}>
          <div className="admin-users__role-card-top"><span className={`admin-users__status ${role.isActive ? "is-active" : "is-inactive"}`}>{role.isActive ? "Active" : "Inactive"}</span><span className="admin-users__role-scope">{role.scope === "GROUP" ? "Group-wide" : "Business unit"}</span></div>
          <h3>{role.name}</h3><p>{role.code}</p>
          <div className="admin-users__role-meta"><span>{role.assignedUsers} assigned user{role.assignedUsers === 1 ? "" : "s"}</span><span>{role.permissionCodes.length} permissions</span></div>
          <div className="admin-users__role-actions">{role.isSystem ? <span className="admin-users__system-label">Built-in role · protected</span> : <><button type="button" onClick={() => edit(role)}>Edit permissions</button><button type="button" className={role.isActive ? "is-danger" : ""} onClick={() => void toggleStatus(role)}>{role.isActive ? "Deactivate" : "Activate"}</button></>}</div>
        </article>)}
      </div>}
    </section>
  </div>;
}
