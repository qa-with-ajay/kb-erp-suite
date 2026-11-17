import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { parsePurchaseProductQuery } from "@/lib/purchase-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = parsePurchaseProductQuery(new URL(request.url).searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Invalid product filters." }, { status: 400 });
  const { search, page, pageSize } = parsed.data;
  const where: Prisma.ProductWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    isActive: true,
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        baseUnit: true,
        purchasePrice: true,
        gstPercentage: true,
        unitConversions: {
          where: { isPurchaseUnit: true },
          select: { unit: true, conversionFactor: true, precision: true, roundingMode: true },
          orderBy: { unit: "asc" },
        },
        variants: {
          where: { isActive: true },
          select: { id: true, code: true, attributes: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
}
