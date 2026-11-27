import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoleAdministration } from "@/lib/role-admin-auth";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
  permissionCodes: z.array(z.string().min(2).max(80)).max(100).refine((codes) => new Set(codes).size === codes.length, "Permissions must be unique.").optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined || value.permissionCodes !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireRoleAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "No valid role changes were supplied." }, { status: 400 });

  const existing = await prisma.role.findUnique({ where: { id }, select: { id: true, code: true, isSystem: true } });
  if (!existing) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (existing.code === "GROUP_ADMIN") return NextResponse.json({ error: "The protected Group Admin superadmin role cannot be modified or deactivated." }, { status: 403 });
  if (parsed.data.permissionCodes !== undefined) {
    const permissions = await prisma.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } }, select: { id: true, code: true } });
    if (permissions.length !== new Set(parsed.data.permissionCodes).size) return NextResponse.json({ error: "One or more selected permissions are invalid." }, { status: 400 });
    const currentRole = await prisma.role.findUnique({ where: { id }, select: { scope: true } });
    const groupOnlyPermissions = new Set(["group.dashboard.read", "businessUnits.manage", "users.manage", "reports.consolidated.read", "roles.manage"]);
    if (currentRole?.scope === "BUSINESS_UNIT" && permissions.some(({ code }) => groupOnlyPermissions.has(code))) {
      return NextResponse.json({ error: "Group-wide permissions can only be assigned to a group-scoped role." }, { status: 400 });
    }
  }

  const role = await prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({ where: { id }, data: { ...(parsed.data.name ? { name: parsed.data.name } : {}), ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}) }, select: { id: true, code: true, name: true, scope: true, isActive: true } });
    if (parsed.data.permissionCodes) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const permissions = await tx.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } }, select: { id: true } });
      await tx.rolePermission.createMany({ data: permissions.map(({ id: permissionId }) => ({ roleId: id, permissionId })) });
    }
    await tx.auditLog.create({ data: { userId: access.session.user.id, action: "UPDATE", entity: "Role", entityId: id, details: { changes: parsed.data } } });
    return updated;
  });
  return NextResponse.json({ role });
}
