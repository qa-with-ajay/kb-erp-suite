import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { parseStockList } from "@/lib/stock-validation";

export async function GET(request: Request) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsedParams = parseStockList(new URL(request.url).searchParams);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid stock filters." }, { status: 400 });
  const params = parsedParams.data;
  const where: Prisma.StockBalanceWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    stockKind: "STANDARD",
    ...(params.locationId ? { locationId: params.locationId } : {}),
    ...(params.search ? {
      product: {
        is: {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { sku: { contains: params.search, mode: "insensitive" } },
          ],
        },
      },
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.stockBalance.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, baseUnit: true, minimumStock: true } },
        variant: { select: { id: true, code: true, attributes: true } },
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.stockBalance.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}
