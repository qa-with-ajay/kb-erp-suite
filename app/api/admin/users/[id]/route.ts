import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserAdministration } from "@/lib/admin-auth";

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  roleCode: z.string().min(2).max(64).optional(),
  businessUnitIds: z.array(z.string().uuid()).max(20).refine((ids) => new Set(ids).size === ids.length, "Business units must be unique.").optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined || value.roleCode !== undefined || value.businessUnitIds !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireUserAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "No valid user changes were supplied." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (id === access.session.user.id && parsed.data.isActive === false) return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });

  const currentGroupAdmin = await prisma.userGroupRole.findFirst({
    where: { userId: id, role: { code: "GROUP_ADMIN", isActive: true } },
    select: { userId: true },
  });
  const removingGroupAdmin = Boolean(currentGroupAdmin) && (
    parsed.data.isActive === false ||
    (parsed.data.roleCode !== undefined && parsed.data.roleCode !== "GROUP_ADMIN")
  );
  if (removingGroupAdmin) {
    const activeGroupAdmins = await prisma.userGroupRole.count({
      where: { role: { code: "GROUP_ADMIN", isActive: true }, user: { isActive: true } },
    });
    if (activeGroupAdmins <= 1) return NextResponse.json({ error: "The last active administrator cannot be deactivated or reassigned. Create another administrator first." }, { status: 409 });
  }

  let role: { id: string; code: string; scope: "GROUP" | "BUSINESS_UNIT" } | null = null;
  if (parsed.data.roleCode !== undefined) {
    role = await prisma.role.findFirst({ where: { code: parsed.data.roleCode, isActive: true }, select: { id: true, code: true, scope: true } });
    if (!role) return NextResponse.json({ error: "Selected role is not available." }, { status: 400 });
    const ids = parsed.data.businessUnitIds ?? [];
    if (role.scope === "GROUP" && ids.length) return NextResponse.json({ error: "Organization-wide roles cannot be assigned to individual business units." }, { status: 400 });
    if (role.scope === "BUSINESS_UNIT" && !ids.length) return NextResponse.json({ error: "Select at least one business unit for this role." }, { status: 400 });
    if (role.code === "UNIT_MANAGER" && ids.length !== 1) return NextResponse.json({ error: "A Unit Manager must be assigned to exactly one business unit." }, { status: 400 });
    if (role.scope === "BUSINESS_UNIT") {
      const units = await prisma.businessUnit.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
      if (units.length !== new Set(ids).size) return NextResponse.json({ error: "One or more selected business units are invalid or inactive." }, { status: 400 });
    }
  } else if (parsed.data.businessUnitIds !== undefined) {
    return NextResponse.json({ error: "Select a role when changing business-unit assignments." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const legacyRole = role ? (role.scope === "GROUP" ? "ADMIN" : role.code === "CASHIER" ? "CASHIER" : "MANAGER") : undefined;
    const user = await tx.user.update({
      where: { id },
      data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}), ...(legacyRole ? { role: legacyRole } : {}) },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (role) {
      await tx.userGroupRole.deleteMany({ where: { userId: id } });
      await tx.userBusinessUnitRole.deleteMany({ where: { userId: id } });
      if (role.scope === "GROUP") {
        await tx.userGroupRole.create({ data: { userId: id, roleId: role.id } });
      } else {
        await tx.userBusinessUnitRole.createMany({ data: (parsed.data.businessUnitIds ?? []).map((businessUnitId) => ({ userId: id, businessUnitId, roleId: role!.id })) });
      }
    }

    await tx.auditLog.create({ data: {
      userId: access.session.user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      details: { changes: parsed.data, roleCode: role?.code ?? null },
    } });
    return user;
  });

  return NextResponse.json({ user: result });
}
