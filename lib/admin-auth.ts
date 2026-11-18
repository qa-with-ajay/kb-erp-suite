import { auth } from "@/auth";
import { hasGroupPermission } from "@/lib/inventory-auth";

export async function requireUserAdministration() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, status: 401 as const, error: "Authentication required." };
  }

  const allowed = await hasGroupPermission(session.user.id, "users.manage");
  if (!allowed) {
    return { ok: false as const, status: 403 as const, error: "You do not have permission to manage users." };
  }

  return { ok: true as const, session };
}
