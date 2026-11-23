import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import type { Session } from "next-auth";

export const ACTIVE_BUSINESS_UNIT_COOKIE = "active-business-unit";

export type InventoryPermission = "inventory.read" | "inventory.manage";

type BusinessUnitContext = {
  session: Session;
  businessUnit: { id: string; code: string; name: string };
};

type InventoryAccessResult =
  | { ok: true; context: BusinessUnitContext }
  | { ok: false; status: 401 | 403; error: string };

function getPermissionCodes(assignments: Array<{
  role: {
    isActive: boolean;
    scope: "GROUP" | "BUSINESS_UNIT";
    permissions: Array<{ permission: { code: string } }>;
  };
}>, scope: "GROUP" | "BUSINESS_UNIT") {
  return new Set(
    assignments.flatMap(({ role }) =>
      role.isActive && role.scope === scope
        ? role.permissions.map(({ permission }) => permission.code)
        : [],
    ),
  );
}

export async function getInventorySession() {
  const session = await auth();
  return session?.user?.id ? session : null;
}

export async function getBusinessUnitAccess(permission: string): Promise<InventoryAccessResult> {
  const session = await getInventorySession();
  if (!session) return { ok: false, status: 401, error: "Authentication required." };

  const [groupRoles, unitRoles] = await Promise.all([
    prisma.userGroupRole.findMany({
      where: { userId: session.user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    prisma.userBusinessUnitRole.findMany({
      where: { userId: session.user.id, businessUnit: { isActive: true } },
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
        role: { include: { permissions: { include: { permission: true } } } },
      },
    }),
  ]);
  const groupPermissions = getPermissionCodes(groupRoles, "GROUP");
  const activeUnitRoles = unitRoles.filter(
    ({ role }) => role.isActive && role.scope === "BUSINESS_UNIT",
  );
  const eligibleUnitRoles = activeUnitRoles.filter(({ role }) =>
    role.permissions.some(({ permission: unitPermission }) => unitPermission.code === permission),
  );

  const selectedUnitId = (await cookies()).get(ACTIVE_BUSINESS_UNIT_COOKIE)?.value;
  const hasGroupPermission = groupPermissions.has(permission);
  let businessUnit: BusinessUnitContext["businessUnit"] | undefined;

  if (hasGroupPermission) {
    const selectedUnit = selectedUnitId
      ? await prisma.businessUnit.findFirst({
          where: { id: selectedUnitId, isActive: true },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (selectedUnit) {
      businessUnit = selectedUnit;
    } else {
      const activeUnits = await prisma.businessUnit.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      });
      businessUnit = activeUnits.find(({ code }) => code === "KB_INTERIORS") ?? activeUnits[0];
    }
  } else {
    const selectedAssignment = activeUnitRoles.find(({ businessUnit: unit }) => unit.id === selectedUnitId);
    const defaultAssignment = activeUnitRoles.find(({ businessUnit: unit }) => unit.code === "KB_INTERIORS")
      ?? activeUnitRoles[0];
    businessUnit = (selectedAssignment ?? defaultAssignment)?.businessUnit;
  }

  if (!businessUnit) return { ok: false, status: 403, error: "No authorized business unit is assigned." };
  const hasUnitPermission = eligibleUnitRoles.some(({ businessUnit: unit }) => unit.id === businessUnit?.id);
  if (!hasGroupPermission && !hasUnitPermission) {
    return { ok: false, status: 403, error: "You do not have permission to access this business unit." };
  }

  return { ok: true, context: { session, businessUnit } };
}

export async function getBusinessUnitPermissionCodes() {
  const session = await getInventorySession();
  if (!session) return new Set<string>();

  const [groupRoles, unitRoles, selectedUnitId] = await Promise.all([
    prisma.userGroupRole.findMany({
      where: { userId: session.user.id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    prisma.userBusinessUnitRole.findMany({
      where: { userId: session.user.id, businessUnit: { isActive: true } },
      include: {
        businessUnit: { select: { id: true } },
        role: { include: { permissions: { include: { permission: true } } } },
      },
    }),
    cookies().then((cookieStore) => cookieStore.get(ACTIVE_BUSINESS_UNIT_COOKIE)?.value),
  ]);
  const permissions = getPermissionCodes(groupRoles, "GROUP");
  const activeUnitRoles = unitRoles.filter(({ role }) => role.isActive && role.scope === "BUSINESS_UNIT");

  if (selectedUnitId) {
    const selectedRoles = activeUnitRoles.filter(({ businessUnit }) => businessUnit.id === selectedUnitId);
    if (selectedRoles.length) {
      for (const { role } of selectedRoles) {
        for (const { permission } of role.permissions) permissions.add(permission.code);
      }
    } else if (permissions.size) {
      const selectedUnit = await prisma.businessUnit.findFirst({
        where: { id: selectedUnitId, isActive: true },
        select: { id: true },
      });
      if (!selectedUnit) return new Set<string>();
    } else {
      return permissions;
    }
  } else {
    if (permissions.size) {
      const activeUnit = await prisma.businessUnit.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!activeUnit) return new Set<string>();
    }
    for (const { role } of activeUnitRoles) {
      for (const { permission } of role.permissions) permissions.add(permission.code);
    }
  }

  return permissions;
}

export async function getInventoryAccess(permission: InventoryPermission) {
  return getBusinessUnitAccess(permission);
}

export async function hasGroupPermission(userId: string, permissionCode: string) {
  const assignment = await prisma.userGroupRole.findFirst({
    where: {
      userId,
      role: {
        isActive: true,
        scope: "GROUP",
        permissions: { some: { permission: { code: permissionCode } } },
      },
    },
    select: { roleId: true },
  });
  return Boolean(assignment);
}

export async function getAvailableBusinessUnits(userId: string) {
  const groupRoles = await prisma.userGroupRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const canAccessAllUnits = groupRoles.some(
    ({ role }) =>
      role.isActive &&
      role.scope === "GROUP" &&
      (role.code === "GROUP_ADMIN" ||
        role.permissions.some(({ permission }) =>
          ["inventory.read", "inventory.manage", "businessUnits.manage"].includes(permission.code),
        )),
  );
  if (canAccessAllUnits) {
    return prisma.businessUnit.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  const assignments = await prisma.userBusinessUnitRole.findMany({
    where: { userId, businessUnit: { isActive: true }, role: { isActive: true, scope: "BUSINESS_UNIT" } },
    select: { businessUnit: { select: { id: true, code: true, name: true } } },
    distinct: ["businessUnitId"],
    orderBy: { businessUnit: { name: "asc" } },
  });
  return assignments.map(({ businessUnit }) => businessUnit);
}


