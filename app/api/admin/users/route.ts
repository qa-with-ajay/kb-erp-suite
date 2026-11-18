import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserAdministration } from "@/lib/admin-auth";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  roleCode: z.string().min(2).max(64),
  businessUnitIds: z.array(z.string().uuid()).max(20).refine((ids) => new Set(ids).size === ids.length, "Business units must be unique.").default([]),
});

export async function GET() {
  const access = await requireUserAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const [users, roles, businessUnits] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        groupRoles: { include: { role: { select: { code: true, name: true, scope: true } } } },
        businessUnitRoles: {
          include: {
            role: { select: { code: true, name: true, scope: true } },
            businessUnit: { select: { id: true, code: true, name: true } },
          },
          orderBy: { businessUnit: { name: "asc" } },
        },
      },
    }),
    prisma.role.findMany({
      where: { isActive: true },
      select: { code: true, name: true, scope: true },
      orderBy: [{ scope: "asc" }, { name: "asc" }],
    }),
    prisma.businessUnit.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    users: users.map(({ groupRoles, businessUnitRoles, ...user }) => ({
      ...user,
      assignments: [
        ...groupRoles.map(({ role }) => ({ roleCode: role.code, roleName: role.name, scope: role.scope, businessUnit: null })),
        ...businessUnitRoles.map(({ role, businessUnit }) => ({ roleCode: role.code, roleName: role.name, scope: role.scope, businessUnit })),
      ],
    })),
    roles,
    businessUnits,
  });
}

export async function POST(request: Request) {
  const access = await requireUserAdministration();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, password (at least 12 characters), role and business-unit assignment." }, { status: 400 });

  const { name, email, password, roleCode, businessUnitIds } = parsed.data;
  const role = await prisma.role.findFirst({ where: { code: roleCode, isActive: true }, select: { id: true, code: true, name: true, scope: true } });
  if (!role) return NextResponse.json({ error: "Selected role is not available." }, { status: 400 });
  if (role.scope === "GROUP" && businessUnitIds.length) return NextResponse.json({ error: "Organization-wide roles cannot be assigned to individual business units." }, { status: 400 });
  if (role.scope === "BUSINESS_UNIT" && !businessUnitIds.length) return NextResponse.json({ error: "Select at least one business unit for this role." }, { status: 400 });
  if (role.code === "UNIT_MANAGER" && businessUnitIds.length !== 1) return NextResponse.json({ error: "A Unit Manager must be assigned to exactly one business unit." }, { status: 400 });

  const units = role.scope === "BUSINESS_UNIT"
    ? await prisma.businessUnit.findMany({ where: { id: { in: businessUnitIds }, isActive: true }, select: { id: true } })
    : [];
  if (role.scope === "BUSINESS_UNIT" && units.length !== new Set(businessUnitIds).size) return NextResponse.json({ error: "One or more selected business units are invalid or inactive." }, { status: 400 });

  try {
    const passwordHash = await hash(password, 12);
    const legacyRole = role.scope === "GROUP" ? "ADMIN" : role.code === "CASHIER" ? "CASHIER" : "MANAGER";
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name, email: email.toLowerCase(), passwordHash, role: legacyRole } });
      if (role.scope === "GROUP") {
        await tx.userGroupRole.create({ data: { userId: created.id, roleId: role.id } });
      } else {
        await tx.userBusinessUnitRole.createMany({ data: units.map(({ id }) => ({ userId: created.id, businessUnitId: id, roleId: role.id })) });
      }
      await tx.auditLog.create({ data: {
        userId: access.session.user.id,
        action: "CREATE",
        entity: "User",
        entityId: created.id,
        details: { email: created.email, roleCode: role.code, businessUnitIds },
      } });
      return { id: created.id, name: created.name, email: created.email };
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email address already exists." }, { status: 409 });
    }
    throw error;
  }
}
