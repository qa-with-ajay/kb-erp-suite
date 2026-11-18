import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAdministration } from "@/lib/role-admin-auth";

const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scope: z.enum(["GROUP", "BUSINESS_UNIT"]),
  permissionCodes: z.array(z.string().min(2).max(80)).min(1).max(50).refine((codes) => new Set(codes).size === codes.length, "Permissions must be unique."),
});

function makeCode(name: string) {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return `CUSTOM_${slug || "ROLE"}`;
}

export async function GET() {
  const access = await requireRoleAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ scope: "asc" }, { name: "asc" }],
      include: { permissions: { include: { permission: { select: { code: true, description: true } } } }, _count: { select: { groupUsers: true, unitUsers: true } } },
    }),
    prisma.permission.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" } }),
  ]);
  return NextResponse.json({
    roles: roles.map(({ permissions: rolePermissions, _count, ...role }) => ({
      ...role,
      permissionCodes: rolePermissions.map(({ permission }) => permission.code),
      assignedUsers: _count.groupUsers + _count.unitUsers,
    })),
    permissions,
  });
}

export async function POST(request: Request) {
  const access = await requireRoleAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a role name, scope and at least one permission." }, { status: 400 });
  const permissions = await prisma.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } }, select: { id: true, code: true } });
  if (permissions.length !== new Set(parsed.data.permissionCodes).size) return NextResponse.json({ error: "One or more selected permissions are invalid." }, { status: 400 });
  const groupOnlyPermissions = new Set(["group.dashboard.read", "businessUnits.manage", "users.manage", "reports.consolidated.read", "roles.manage"]);
  if (parsed.data.scope === "BUSINESS_UNIT" && permissions.some(({ code: permissionCode }) => groupOnlyPermissions.has(permissionCode))) {
    return NextResponse.json({ error: "Group-wide permissions can only be assigned to a group-scoped role." }, { status: 400 });
  }
  const code = makeCode(parsed.data.name);
  try {
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { code, name: parsed.data.name, scope: parsed.data.scope, isSystem: false },
        select: { id: true, code: true, name: true, scope: true },
      });
      await tx.rolePermission.createMany({ data: permissions.map(({ id }) => ({ roleId: created.id, permissionId: id })) });
      await tx.auditLog.create({ data: { userId: access.session.user.id, action: "CREATE", entity: "Role", entityId: created.id, details: { code, scope: created.scope, permissionCodes: parsed.data.permissionCodes } } });
      return created;
    });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "A role with a similar name already exists. Choose another name." }, { status: 409 });
    throw error;
  }
}
