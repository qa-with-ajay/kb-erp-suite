import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid stock location ID." }, { status: 400 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Invalid stock location data.", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      const current = await tx.stockLocation.findFirst({ where: { id, businessUnitId: businessUnit.id }, select: { id: true } });
      if (!current) return null;
      const updated = await tx.stockLocation.update({
        where: { id },
        data: {
          ...("name" in parsed.data ? { name: parsed.data.name } : {}),
          ...("code" in parsed.data ? { code: parsed.data.code?.toUpperCase() } : {}),
          ...("isActive" in parsed.data ? { isActive: parsed.data.isActive } : {}),
        },
        select: { id: true, name: true, code: true, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "UPDATE",
          entity: "StockLocation",
          entityId: updated.id,
          details: { name: updated.name, code: updated.code, isActive: updated.isActive },
        },
      });
      return updated;
    });
    if (!item) return NextResponse.json({ error: "Stock location not found." }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A stock location with this name or code already exists in this business unit." }, { status: 409 });
    }
    console.error("PATCH /api/inventory/locations/[id]:", error);
    return NextResponse.json({ error: "Unable to update stock location." }, { status: 500 });
  }
}
