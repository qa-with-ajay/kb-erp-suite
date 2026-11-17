import { NextResponse } from "next/server";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      lines: { orderBy: { lineNumber: "asc" } },
      receipts: {
        include: {
          lines: { orderBy: { lineNumber: "asc" } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  return NextResponse.json({ order });
}
