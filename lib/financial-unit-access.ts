import { prisma } from "@/lib/prisma";
import { getInventorySession, hasGroupPermission } from "@/lib/inventory-auth";

export async function getFinancialUnitAccess(businessUnitId: string) {
  const session = await getInventorySession();
  if (!session) return { ok: false as const, status: 401 as const, error: "Authentication required." };

  const businessUnit = await prisma.businessUnit.findFirst({
    where: { id: businessUnitId, isActive: true },
    select: { id: true, code: true, name: true, profile: { select: { currency: true } } },
  });
  if (!businessUnit) return { ok: false as const, status: 404 as const, error: "Business unit not found." };

  const selectedRoleCode = session.user.selectedRoleCode;
  const [groupAccess, unitAccess] = await Promise.all([
    hasGroupPermission(session.user.id, "accounting.read"),
    prisma.userBusinessUnitRole.findFirst({
      where: {
        userId: session.user.id,
        businessUnitId,
        ...(selectedRoleCode ? { role: { code: selectedRoleCode } } : {}),
        role: {
          isActive: true,
          scope: "BUSINESS_UNIT",
          ...(selectedRoleCode ? { code: selectedRoleCode } : {}),
          permissions: { some: { permission: { code: "accounting.read" } } },
        },
      },
      select: { roleId: true },
    }),
  ]);

  if (!groupAccess && !unitAccess) {
    return { ok: false as const, status: 403 as const, error: "You do not have permission to view this unit's financial information." };
  }
  return { ok: true as const, context: { session, businessUnit } };
}
