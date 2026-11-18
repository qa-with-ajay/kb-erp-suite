import { redirect } from "next/navigation";
import { requireRoleAdministration } from "@/lib/role-admin-auth";
import { AdminRolesManager } from "@/components/admin-roles-manager";

export default async function AdminRolesPage() {
  const access = await requireRoleAdministration();
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">CENTRAL ADMINISTRATION</p>
          <h1>Roles &amp; permissions</h1>
          <p>Define what each role can access across the group or within assigned business units.</p>
        </div>
        <span className="admin-page__access-pill">Administrator access</span>
      </header>
      <AdminRolesManager />
    </main>
  );
}
