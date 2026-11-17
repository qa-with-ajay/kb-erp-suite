import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type UnitMetricRow = {
  id: string;
  code: string;
  name: string;
  currency: string;
  productCount: number;
  categoryCount: number;
  brandCount: number;
  stockValue: Prisma.Decimal;
  movementCount: number;
  salesTotal: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  invoiceCount: number;
  accountsReceivable: Prisma.Decimal;
  accountsPayable: Prisma.Decimal;
  customerCredits: Prisma.Decimal;
  supplierCredits: Prisma.Decimal;
};

type LowStockRow = {
  businessUnitId: string;
  businessUnitName: string;
  productId: string;
  productName: string;
  sku: string;
  baseUnit: string;
  currentStock: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
};

export type LowStockItem = {
  productId: string;
  productName: string;
  sku: string;
  baseUnit: string;
  currentStock: string;
  minimumStock: string;
};

export type UnitDashboardData = {
  id: string;
  code: string;
  name: string;
  currency: string;
  productCount: number;
  categoryCount: number;
  brandCount: number;
  stockValue: string;
  movementCount: number;
  salesTotal: string;
  grossProfit: string;
  invoiceCount: number;
  accountsReceivable: string;
  accountsPayable: string;
  customerCredits: string;
  supplierCredits: string;
  lowStockCount: number;
  lowStockItems: LowStockItem[];
};

function metricFilter(businessUnitId?: string) {
  return businessUnitId
    ? Prisma.sql`AND unit."id" = ${businessUnitId}::uuid`
    : Prisma.empty;
}

async function loadInventoryDashboard(businessUnitId?: string): Promise<UnitDashboardData[]> {
  const filter = metricFilter(businessUnitId);
  const [units, lowStockRows] = await Promise.all([
    prisma.$queryRaw<UnitMetricRow[]>(Prisma.sql`
      SELECT
        unit."id",
        unit."code",
        unit."name",
        COALESCE((SELECT profile."currency" FROM "BusinessProfile" profile
          WHERE profile."businessUnitId" = unit."id"), 'INR') AS "currency",
        (SELECT COUNT(*)::int FROM "Product" product
          WHERE product."businessUnitId" = unit."id" AND product."isActive" = true) AS "productCount",
        (SELECT COUNT(*)::int FROM "Category" category
          WHERE category."businessUnitId" = unit."id" AND category."isActive" = true) AS "categoryCount",
        (SELECT COUNT(*)::int FROM "Brand" brand
          WHERE brand."businessUnitId" = unit."id" AND brand."isActive" = true) AS "brandCount",
        (SELECT COALESCE(SUM(balance."quantity" * balance."averageCost"), 0)::numeric
          FROM "StockBalance" balance
          WHERE balance."businessUnitId" = unit."id" AND balance."stockKind" = 'STANDARD'::"StockKind") AS "stockValue",
        (SELECT COUNT(*)::int FROM "StockMovement" movement
          WHERE movement."businessUnitId" = unit."id") AS "movementCount",
        (SELECT COALESCE(SUM(sale."total" - COALESCE((
            SELECT SUM(saleReturn."total") FROM "SaleReturn" saleReturn
            WHERE saleReturn."businessUnitId" = sale."businessUnitId"
              AND saleReturn."saleId" = sale."id"
              AND saleReturn."reversedAt" IS NULL
          ), 0)), 0)::numeric FROM "Sale" sale
          WHERE sale."businessUnitId" = unit."id") AS "salesTotal",
        (SELECT COALESCE(SUM(
            sale."subtotal" - sale."costOfGoods"
            - COALESCE((
              SELECT SUM(saleReturn."subtotal") FROM "SaleReturn" saleReturn
              WHERE saleReturn."businessUnitId" = sale."businessUnitId"
                AND saleReturn."saleId" = sale."id"
                AND saleReturn."reversedAt" IS NULL
            ), 0)
            + COALESCE((
              SELECT SUM(line."lineCost") FROM "SaleReturnLine" line
              JOIN "SaleReturn" saleReturn ON saleReturn."businessUnitId" = line."businessUnitId" AND saleReturn."id" = line."saleReturnId"
              WHERE line."businessUnitId" = sale."businessUnitId"
                AND line."saleId" = sale."id"
                AND line."disposition" = 'RESTOCK'::"SaleReturnDisposition"
                AND saleReturn."reversedAt" IS NULL
            ), 0)
          ), 0)::numeric FROM "Sale" sale
          WHERE sale."businessUnitId" = unit."id") AS "grossProfit",
        (SELECT COUNT(*)::int FROM "Sale" sale
          WHERE sale."businessUnitId" = unit."id") AS "invoiceCount",
        (SELECT COALESCE(SUM(GREATEST(
            sale."total"
            - COALESCE((SELECT SUM(saleReturn."total") FROM "SaleReturn" saleReturn
                WHERE saleReturn."businessUnitId" = sale."businessUnitId"
                  AND saleReturn."saleId" = sale."id" AND saleReturn."reversedAt" IS NULL), 0)
            - COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment
                WHERE payment."businessUnitId" = sale."businessUnitId"
                  AND payment."saleId" = sale."id" AND payment."reversedAt" IS NULL), 0),
            0)), 0)::numeric
          FROM "Sale" sale
          WHERE sale."businessUnitId" = unit."id") AS "accountsReceivable",
        (SELECT COALESCE(SUM(GREATEST(
            receipt."total"
            - COALESCE((SELECT SUM(purchaseReturn."total") FROM "PurchaseReturn" purchaseReturn
                WHERE purchaseReturn."businessUnitId" = receipt."businessUnitId"
                  AND purchaseReturn."purchaseReceiptId" = receipt."id" AND purchaseReturn."reversedAt" IS NULL), 0)
            - COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment
                WHERE payment."businessUnitId" = receipt."businessUnitId"
                  AND payment."purchaseReceiptId" = receipt."id" AND payment."reversedAt" IS NULL), 0),
            0)), 0)::numeric
          FROM "PurchaseReceipt" receipt
          WHERE receipt."businessUnitId" = unit."id") AS "accountsPayable",
        (SELECT COALESCE(SUM(GREATEST(
            COALESCE((SELECT SUM(saleReturn."total") FROM "SaleReturn" saleReturn
                WHERE saleReturn."businessUnitId" = sale."businessUnitId"
                  AND saleReturn."saleId" = sale."id" AND saleReturn."reversedAt" IS NULL), 0)
            + COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment
                WHERE payment."businessUnitId" = sale."businessUnitId"
                  AND payment."saleId" = sale."id" AND payment."reversedAt" IS NULL), 0)
            - sale."total",
            0)), 0)::numeric
          FROM "Sale" sale
          WHERE sale."businessUnitId" = unit."id") AS "customerCredits",
        (SELECT COALESCE(SUM(GREATEST(
            COALESCE((SELECT SUM(purchaseReturn."total") FROM "PurchaseReturn" purchaseReturn
                WHERE purchaseReturn."businessUnitId" = receipt."businessUnitId"
                  AND purchaseReturn."purchaseReceiptId" = receipt."id" AND purchaseReturn."reversedAt" IS NULL), 0)
            + COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment
                WHERE payment."businessUnitId" = receipt."businessUnitId"
                  AND payment."purchaseReceiptId" = receipt."id" AND payment."reversedAt" IS NULL), 0)
            - receipt."total",
            0)), 0)::numeric
          FROM "PurchaseReceipt" receipt
          WHERE receipt."businessUnitId" = unit."id") AS "supplierCredits"
      FROM "BusinessUnit" unit
      WHERE unit."isActive" = true ${filter}
      ORDER BY unit."name" ASC
    `),
    prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
      SELECT
        product."businessUnitId",
        unit."name" AS "businessUnitName",
        product."id" AS "productId",
        product."name" AS "productName",
        product."sku",
        product."baseUnit"::text AS "baseUnit",
        COALESCE(SUM(balance."quantity"), 0)::numeric AS "currentStock",
        product."minimumStock" AS "minimumStock"
      FROM "Product" product
      JOIN "BusinessUnit" unit ON unit."id" = product."businessUnitId"
      LEFT JOIN "StockBalance" balance
        ON balance."businessUnitId" = product."businessUnitId"
        AND balance."productId" = product."id"
        AND balance."stockKind" = 'STANDARD'::"StockKind"
      WHERE unit."isActive" = true
        AND product."isActive" = true
        AND product."minimumStock" > 0
        ${filter}
      GROUP BY unit."id", unit."name", product."businessUnitId", product."id", product."name", product."sku", product."baseUnit", product."minimumStock"
      HAVING COALESCE(SUM(balance."quantity"), 0) <= product."minimumStock"
      ORDER BY unit."name" ASC, COALESCE(SUM(balance."quantity"), 0) ASC, product."name" ASC
    `),
  ]);

  const alertsByUnit = new Map<string, LowStockRow[]>();
  for (const row of lowStockRows) {
    const alerts = alertsByUnit.get(row.businessUnitId) ?? [];
    alerts.push(row);
    alertsByUnit.set(row.businessUnitId, alerts);
  }

  return units.map((unit) => {
    const alerts = alertsByUnit.get(unit.id) ?? [];
    return {
      ...unit,
      stockValue: unit.stockValue.toString(),
      salesTotal: unit.salesTotal.toString(),
      grossProfit: unit.grossProfit.toString(),
      lowStockCount: alerts.length,
      invoiceCount: unit.invoiceCount,
      accountsReceivable: unit.accountsReceivable.toString(),
      accountsPayable: unit.accountsPayable.toString(),
      customerCredits: unit.customerCredits.toString(),
      supplierCredits: unit.supplierCredits.toString(),
      lowStockItems: alerts.slice(0, 5).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        baseUnit: item.baseUnit,
        currentStock: item.currentStock.toString(),
        minimumStock: item.minimumStock.toString(),
      })),
    };
  });
}

export async function getUnitDashboardData(businessUnitId: string) {
  return (await loadInventoryDashboard(businessUnitId))[0] ?? null;
}

export async function getGroupDashboardData() {
  return loadInventoryDashboard();
}

export function formatAmount(value: string, currency: string) {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
  return `${currency} ${formatted}`;
}

export function formatQuantity(value: string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(value));
}
