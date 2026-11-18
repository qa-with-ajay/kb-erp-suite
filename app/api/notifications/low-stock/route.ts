import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { auth } from "@/auth";
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
    
  `);
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const businessUnitId = access.context.businessUnit.id;

  const currentProductIds = rows.map((row) => row.productId);

  await prisma.$transaction(async (tx) => {
    // Remove notification records for products that recovered.
    if (currentProductIds.length === 0) {
      await tx.lowStockNotification.deleteMany({
        where: { userId, businessUnitId },
      });
    } else {
      await tx.lowStockNotification.deleteMany({
        where: {
          userId,
          businessUnitId,
          productId: { notIn: currentProductIds },
        },
      });
    }

    // Create notifications for newly low-stock products.
    await tx.lowStockNotification.createMany({
      data: currentProductIds.map((productId) => ({
        userId,
        businessUnitId,
        productId,
      })),
      skipDuplicates: true,
    });
  });

  const notifications = await prisma.lowStockNotification.findMany({
    where: {
      userId,
      businessUnitId,
      productId: { in: currentProductIds },
    },
    select: {
      productId: true,
      isRead: true,
    },
  });

  const notificationMap = new Map(
    notifications.map((notification) => [
      notification.productId,
      notification.isRead,
    ])
  );

  const items = rows.slice(0, 5).map(({ total: _total, ...item }) => ({
    ...item,
    isRead: notificationMap.get(item.productId) ?? false,
  }));

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  return NextResponse.json({
    count: unreadCount,
    total: rows[0]?.total ?? 0,
    items,
  });
}
