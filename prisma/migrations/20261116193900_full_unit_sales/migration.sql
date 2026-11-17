-- CreateEnum
CREATE TYPE "SaleTaxMode" AS ENUM ('GST', 'NON_GST');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SALE';

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "taxMode" "SaleTaxMode" NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "costOfGoods" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Sale_totals_check" CHECK (
        "subtotal" >= 0 AND
        "taxAmount" >= 0 AND
        "total" = "subtotal" + "taxAmount" AND
        "costOfGoods" >= 0 AND
        ("taxMode" <> 'NON_GST'::"SaleTaxMode" OR "taxAmount" = 0)
    )
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "variantCode" TEXT,
    "variantAttributes" JSONB,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "lineCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SaleLine_quantity_check" CHECK ("quantity" > 0 AND "quantity" = trunc("quantity")),
    CONSTRAINT "SaleLine_amounts_check" CHECK (
        "unitPrice" >= 0 AND
        "gstPercentage" >= 0 AND "gstPercentage" <= 100 AND
        "lineSubtotal" >= 0 AND
        "lineTax" >= 0 AND
        "lineTotal" = "lineSubtotal" + "lineTax" AND
        "unitCost" >= 0 AND
        "lineCost" >= 0
    )
);

-- CreateIndex
CREATE INDEX "Sale_businessUnitId_createdAt_idx" ON "Sale"("businessUnitId", "createdAt");
CREATE INDEX "Sale_businessUnitId_customerName_idx" ON "Sale"("businessUnitId", "customerName");
CREATE UNIQUE INDEX "Sale_businessUnitId_id_key" ON "Sale"("businessUnitId", "id");
CREATE UNIQUE INDEX "Sale_businessUnitId_invoiceNumber_key" ON "Sale"("businessUnitId", "invoiceNumber");
CREATE UNIQUE INDEX "Sale_businessUnitId_stockMovementId_key" ON "Sale"("businessUnitId", "stockMovementId");
CREATE INDEX "SaleLine_businessUnitId_saleId_idx" ON "SaleLine"("businessUnitId", "saleId");
CREATE INDEX "SaleLine_businessUnitId_productId_idx" ON "SaleLine"("businessUnitId", "productId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessUnitId_stockMovementId_fkey"
  FOREIGN KEY ("businessUnitId", "stockMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_businessUnitId_saleId_fkey"
  FOREIGN KEY ("businessUnitId", "saleId") REFERENCES "Sale"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_businessUnitId_productId_fkey"
  FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_businessUnitId_variantId_fkey"
  FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
