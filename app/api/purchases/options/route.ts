import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { parsePurchasesList } from "@/lib/purchase-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = parsePurchasesList(new URL(request.url).searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Invalid supplier filters." }, { status: 400 });
  const { search, page, pageSize } = parsed.data;
  const where: Prisma.SupplierWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    isActive: true,
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { gstin: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [suppliers, supplierCount, locations] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      select: { id: true, name: true, phone: true, gstin: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supplier.count({ where }),
    prisma.stockLocation.findMany({
      where: { businessUnitId: access.context.businessUnit.id, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({ suppliers, supplierCount, locations, page, pageSize });
}
