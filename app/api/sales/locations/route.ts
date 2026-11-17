import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET() {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const items = await prisma.stockLocation.findMany({
    where: { businessUnitId: access.context.businessUnit.id, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items });
}
