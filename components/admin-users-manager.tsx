"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = { code: string; name: string; scope: "GROUP" | "BUSINESS_UNIT" };
type BusinessUnit = { id: string; code: string; name: string };
type Assignment = { roleCode: string; roleName: string; scope: "GROUP" | "BUSINESS_UNIT"; businessUnit: BusinessUnit | null };
type ManagedUser = {
  id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string; assignments: Assignment[];
};
type Payload = { users: ManagedUser[]; roles: Role[]; businessUnits: BusinessUnit[] };

const emptyForm = { name: "", email: "", password: "", roleCode: "UNIT_MANAGER", businessUnitIds: [] as string[] };

function roleLabel(role: Role) {
  return role.scope === "GROUP" ? `${role.name} · All business units` : role.name;
}

export function AdminUsersManager() {
  const [data, setData] = useState<Payload>({ users: [], roles: [], businessUnits: [] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load users.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedRole = useMemo(() => data.roles.find((role) => role.code === form.roleCode), [data.roles, form.roleCode]);
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.users;
    return data.users.filter((user) => `${user.name} ${user.email} ${user.assignments.map((item) => item.roleName).join(" ")} ${user.assignments.map((item) => item.businessUnit?.name ?? "All units").join(" ")}`.toLowerCase().includes(needle));
  }, [data.users, query]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
  }

  function editUser(user: ManagedUser) {
    const assignment = user.assignments[0];
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      roleCode: assignment?.roleCode ?? "UNIT_MANAGER",
      businessUnitIds: user.assignments.flatMap((item) => item.businessUnit ? [item.businessUnit.id] : []),
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleUnit(id: string) {
    setForm((current) => ({
      ...current,
      businessUnitIds: current.businessUnitIds.includes(id)
        ? current.businessUnitIds.filter((value) => value !== id)
        : [...current.businessUnitIds, id],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: form.name,
        roleCode: form.roleCode,
        businessUnitIds: selectedRole?.scope === "GROUP" ? [] : form.businessUnitIds,
        ...(!editingId ? { email: form.email, password: form.password } : {}),
      };
      const response = await fetch(editingId ? `/api/admin/users/${editingId}` : "/api/admin/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save user.");
      setNotice(editingId ? "User details and access assignments updated." : "User account created successfully.");
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: ManagedUser) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update account status.");
      setNotice(`${user.name}'s account has been ${user.isActive ? "deactivated" : "activated"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update account status.");
    }
  }

  return (
    <div className="admin-users">
      <section className="admin-users__form-card">
        <div className="admin-users__section-heading">
          <div>
            <h2>{editingId ? "Edit user access" : "Create user account"}</h2>
            <p>{editingId ? "Update the user's profile, role or business-unit assignments." : "Create a login and assign the appropriate level of access."}</p>
          </div>
          {editingId && <button className="admin-users__secondary-button" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>

        <form onSubmit={submit} className="admin-users__form">
          <div className="admin-users__fields">
            <label className="admin-users__field">
              <span>Full name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={120} required />
            </label>
            {!editingId && <label className="admin-users__field">
              <span>Email address</span>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>}
            {!editingId && <label className="admin-users__field">
              <span>Temporary password</span>
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} autoComplete="new-password" required />
              <small>At least 12 characters. Share it securely with the user.</small>
            </label>}
            <label className="admin-users__field">
              <span>Role</span>
              <select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value, businessUnitIds: [] })} required>
                {data.roles.map((role) => <option key={role.code} value={role.code}>{roleLabel(role)}</option>)}
              </select>
            </label>
          </div>

          {selectedRole?.scope === "BUSINESS_UNIT" ? (
            <fieldset className="admin-users__unit-picker">
              <legend>Assign business unit(s)</legend>
              <p>{selectedRole?.code === "UNIT_MANAGER" ? "A Unit Manager must be assigned to exactly one business unit." : "A user can only access the business units selected here."}</p>
              <div className="admin-users__unit-grid">
                {data.businessUnits.map((unit) => (
                  <label key={unit.id} className="admin-users__unit-option">
                    <input type="checkbox" checked={form.businessUnitIds.includes(unit.id)} onChange={() => toggleUnit(unit.id)} />
                    <span>{unit.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="admin-users__global-notice">
              <strong>Organization-wide access</strong>
              <span>This role can work across all active business units. No individual unit assignment is required.</span>
            </div>
          )}

          {error && <p className="admin-users__message admin-users__message--error" role="alert">{error}</p>}
          {notice && <p className="admin-users__message admin-users__message--success" role="status">{notice}</p>}
          <div className="admin-users__form-actions">
            <button className="admin-users__primary-button" type="submit" disabled={saving || (selectedRole?.scope === "BUSINESS_UNIT" && form.businessUnitIds.length === 0) || (selectedRole?.code === "UNIT_MANAGER" && form.businessUnitIds.length !== 1)}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create account"}
            </button>
            {!editingId && <span className="admin-users__hint">Passwords are securely hashed before storage.</span>}
          </div>
        </form>
      </section>

      <section className="admin-users__list-card">
        <div className="admin-users__section-heading admin-users__list-heading">
          <div>
            <h2>Users &amp; access</h2>
            <p>{data.users.length} account{data.users.length === 1 ? "" : "s"} registered in the ERP</p>
          </div>
          <label className="admin-users__search"><span className="sr-only">Search users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users or units…" /></label>
        </div>
        {loading ? <p className="admin-users__empty">Loading user accounts…</p> : filteredUsers.length === 0 ? <p className="admin-users__empty">No users match this search.</p> : (
          <div className="admin-users__table-wrap">
            <table className="admin-users__table">
              <thead><tr><th>User</th><th>Role &amp; business unit access</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.name}</strong><small>{user.email}</small></td>
                    <td><div className="admin-users__assignments">{user.assignments.length ? user.assignments.map((assignment, index) => (
                      <span className="admin-users__assignment" key={`${assignment.roleCode}-${assignment.businessUnit?.id ?? "group"}-${index}`}>
                        <strong>{assignment.roleName}</strong><small>{assignment.businessUnit?.name ?? "All business units"}</small>
                      </span>
                    )) : <span className="admin-users__unassigned">No role assignment</span>}</div></td>
                    <td><span className={`admin-users__status ${user.isActive ? "is-active" : "is-inactive"}`}>{user.isActive ? "Active" : "Inactive"}</span></td>
                    <td><div className="admin-users__row-actions"><button type="button" onClick={() => editUser(user)}>Edit access</button><button type="button" className={user.isActive ? "is-danger" : ""} onClick={() => void toggleStatus(user)}>{user.isActive ? "Deactivate" : "Activate"}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
