import { redirect } from "next/navigation";
import { requireUserAdministration } from "@/lib/admin-auth";
import { AdminUsersManager } from "@/components/admin-users-manager";

export default async function AdminUsersPage() {
  const access = await requireUserAdministration();
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");

  return (
    <main className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">CENTRAL ADMINISTRATION</p>
          <h1>User management</h1>
          <p>Create accounts, assign roles and control access to business units.</p>
        </div>
        <span className="admin-page__access-pill">Administrator access</span>
      </header>
      <AdminUsersManager />
    </main>
  );
}
