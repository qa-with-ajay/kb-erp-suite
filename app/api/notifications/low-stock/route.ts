import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

type LowStockRow = {
  productId: string;
  productName: string;
  sku: string;
  baseUnit: string;
  currentStock: string;
  minimumStock: string;
  total: number;
};

export async function GET() {
  let access = await getBusinessUnitAccess("inventory.read");
  if (!access.ok && access.status === 403) access = await getBusinessUnitAccess("reports.unit.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const rows = await prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
    WITH low_stock AS (
      SELECT
        product."id" AS "productId",
        product."name" AS "productName",
        product."sku",
        product."baseUnit",
        COALESCE(SUM(balance."quantity"), 0)::text AS "currentStock",
        product."minimumStock"::text AS "minimumStock"
      FROM "Product" product
      LEFT JOIN "StockBalance" balance
        ON balance."businessUnitId" = product."businessUnitId"
        AND balance."productId" = product."id"
        AND balance."stockKind" = 'STANDARD'::"StockKind"
      WHERE product."businessUnitId" = ${access.context.businessUnit.id}::uuid
        AND product."isActive" = true
        AND product."minimumStock" > 0
      GROUP BY product."id", product."name", product."sku", product."baseUnit", product."minimumStock"
      HAVING COALESCE(SUM(balance."quantity"), 0) <= product."minimumStock"
    )
    SELECT low_stock.*, COUNT(*) OVER()::int AS "total"
    FROM low_stock
    ORDER BY "currentStock"::numeric ASC, "productName" ASC
    LIMIT 5
  `);

  return NextResponse.json({
    count: rows[0]?.total ?? 0,
    items: rows.map(({ total: _total, ...item }) => item),
  });
}
