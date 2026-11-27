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
  const [viewingRole, setViewingRole] = useState<Role | null>(null);

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
    if (role.code === "GROUP_ADMIN") return;
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
        <div><h2>{editingId ? "Edit role & permissions" : "Create custom role"}</h2><p>Manage permissions for system and custom roles. Group Admin remains protected as the system superadmin.</p></div>
        {editingId && <button type="button" className="admin-users__secondary-button" onClick={reset}>Cancel edit</button>}
      </div>
      {editingId && data.roles.find((role) => role.id === editingId)?.isSystem && <div className="admin-users__global-notice"><strong>System role</strong><span>You can update its name and permissions. Scope and role code remain fixed. Changes immediately affect all assigned users.</span></div>}
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
        <div className="admin-users__form-actions"><button className="admin-users__primary-button" type="submit" disabled={saving || (!editingId && form.permissionCodes.length === 0)}>{saving ? "Saving…" : editingId ? "Save role" : "Create role"}</button><span className="admin-users__hint">Changes apply to every user assigned this role.</span></div>
      </form>
    </section>

    <section className="admin-users__list-card">
      <div className="admin-users__section-heading"><div><h2>Available roles</h2><p>System roles and custom roles configured for the ERP.</p></div></div>
      {loading ? <p className="admin-users__empty">Loading roles…</p> : (
        <div className="admin-users__table-wrap">
          <table className="admin-users__table admin-roles__table">
            <thead><tr><th>Role</th><th>Scope</th><th>Permissions</th><th>Assigned users</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {data.roles.map((role) => {
                const areas = [...new Set(role.permissionCodes.map((code) => code.split(".")[0].replaceAll("_", " ")))];
                return <tr key={role.id}>
                  <td><strong>{role.name}</strong><small>{role.code}{role.isSystem ? " · Built-in" : " · Custom"}</small></td>
                  <td>{role.scope === "GROUP" ? "Group" : "Business Unit"}</td>
                  <td><div className="admin-roles__summary">{role.code === "GROUP_ADMIN" ? "All permissions" : areas.length ? areas.map((area) => area.replace(/\\b\\w/g, (letter) => letter.toUpperCase())).join(", ") : "No permissions"}</div><small>{role.permissionCodes.length} permission{role.permissionCodes.length === 1 ? "" : "s"}</small></td>
                  <td>{role.assignedUsers}</td>
                  <td><span className={`admin-users__status ${role.isActive ? "is-active" : "is-inactive"}`}>{role.isActive ? "Active" : "Inactive"}</span></td>
                  <td><div className="admin-users__row-actions"><button type="button" onClick={() => setViewingRole(role)}>View</button>{role.code !== "GROUP_ADMIN" && <button type="button" onClick={() => edit(role)}>Edit</button>}{role.code !== "GROUP_ADMIN" && <button type="button" className={role.isActive ? "is-danger" : ""} onClick={() => void toggleStatus(role)}>{role.isActive ? "Deactivate" : "Activate"}</button>}{role.code === "GROUP_ADMIN" && <span className="admin-users__system-label">Protected</span>}</div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
    {viewingRole && <div className="admin-roles__modal-backdrop" role="presentation" onClick={() => setViewingRole(null)}>
      <section className="admin-roles__detail" role="dialog" aria-modal="true" aria-labelledby="admin-role-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="admin-users__section-heading">
          <div><h2 id="admin-role-detail-title">{viewingRole.name}</h2><p>{viewingRole.scope === "GROUP" ? "Group-wide role" : "Business-unit role"} · {viewingRole.isSystem ? "Built-in role" : "Custom role"}</p></div>
          <button type="button" className="admin-users__secondary-button" onClick={() => setViewingRole(null)}>Close</button>
        </div>
        <div className="admin-roles__detail-status"><span className={`admin-users__status ${viewingRole.isActive ? "is-active" : "is-inactive"}`}>{viewingRole.isActive ? "Active" : "Inactive"}</span><span>{viewingRole.assignedUsers} assigned users</span></div>
        {viewingRole.code === "GROUP_ADMIN" ? <div className="admin-users__global-notice"><strong>All permissions</strong><span>Group Admin has system-wide access across all active business units.</span></div> : <div className="admin-roles__permission-list">
          {permissionsByArea.map(([area, permissions]) => {
            const selected = permissions.filter((permission) => viewingRole.permissionCodes.includes(permission.code));
            if (!selected.length) return null;
            return <section className="admin-users__permission-group" key={area}><h3>{area.replaceAll("_", " ")}</h3><ul>{selected.map((permission) => <li key={permission.code}><strong>{permission.code}</strong><span>{permission.description}</span></li>)}</ul></section>;
          })}
        </div>}
      </section>
    </div>}

  </div>;
}
