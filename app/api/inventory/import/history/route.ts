import { NextResponse } from "next/server";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const items = await prisma.auditLog.findMany({
    where: { businessUnitId: access.context.businessUnit.id, entity: "InventoryImport" },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      user: item.user,
      summary: item.details,
      action: item.action,
    })),
  });
}
