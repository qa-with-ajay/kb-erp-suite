import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { parseSaleProductQuery } from "@/lib/sales-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = parseSaleProductQuery(new URL(request.url).searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Invalid product filters." }, { status: 400 });
  const params = parsed.data;
  const location = await prisma.stockLocation.findFirst({
    where: { id: params.locationId, businessUnitId: access.context.businessUnit.id, isActive: true },
    select: { id: true },
  });
  if (!location) return NextResponse.json({ error: "Select an active stock location in this business unit." }, { status: 400 });

  const search: Prisma.ProductWhereInput[] = params.search ? [{
    OR: [
      { name: { contains: params.search, mode: "insensitive" } },
      { sku: { contains: params.search, mode: "insensitive" } },
      { barcode: { contains: params.search, mode: "insensitive" } },
    ],
  }] : [];
  const where: Prisma.ProductWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    isActive: true,
    OR: [
      { productType: "STANDARD" },
      { productType: "PANEL", baseUnit: "PCS" },
    ],
    AND: [
      { stockBalances: { some: { locationId: location.id, stockKind: "STANDARD", quantity: { gt: 0 } } } },
      ...search,
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        baseUnit: true,
        productType: true,
        sellingPrice: true,
        gstPercentage: true,
        variants: {
          where: { isActive: true },
          select: { id: true, code: true, attributes: true },
          orderBy: { createdAt: "asc" },
        },
        stockBalances: {
          where: { locationId: location.id, stockKind: "STANDARD" },
          select: { variantId: true, quantity: true },
        },
      },
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}
