import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserRole } from "@prisma/client";
import { getBusinessUnitAccess, hasGroupPermission } from "@/lib/inventory-auth";

export default async function PostLoginPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.role === UserRole.ADMIN || await hasGroupPermission(session.user.id, "businessUnits.manage")) {
    redirect("/group-dashboard");
  }

  const dashboardAccess = await getBusinessUnitAccess("reports.unit.read");
  if (dashboardAccess.ok) redirect("/dashboard");

  const inventoryAccess = await getBusinessUnitAccess("inventory.read");
  if (inventoryAccess.ok) redirect("/inventory");

  redirect("/access-denied");
}
