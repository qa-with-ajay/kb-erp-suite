import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { catalogUpdateSchema, readJsonBody } from "@/lib/catalog-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid category ID." }, { status: 400 });
  }
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = catalogUpdateSchema.safeParse(body.data);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Invalid category data.", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      const current = await tx.category.findFirst({ where: { id, businessUnitId: businessUnit.id }, select: { id: true } });
      if (!current) return null;
      const updated = await tx.category.update({
        where: { id },
        data: {
          ...("name" in parsed.data ? { name: parsed.data.name } : {}),
          ...("description" in parsed.data ? { description: parsed.data.description || null } : {}),
          ...("isActive" in parsed.data ? { isActive: parsed.data.isActive } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "UPDATE",
          entity: "Category",
          entityId: updated.id,
          details: { name: updated.name, isActive: updated.isActive },
        },
      });
      return updated;
    });
    if (!item) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
    }
    throw error;
  }
}
