-- CreateEnum
CREATE TYPE "SaleReturnDisposition" AS ENUM ('RESTOCK', 'DAMAGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RETURN_REVERSAL';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN_REVERSAL';

-- AlterTable
ALTER TABLE "BusinessUnit" ADD COLUMN     "nextPurchaseDebitNoteNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextSalesCreditNoteNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalMovementId" UUID,
    "reversalIdempotencyKey" TEXT,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturnLine" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "saleReturnId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "variantCode" TEXT,
    "variantAttributes" JSONB,
    "quantity" DECIMAL(18,4) NOT NULL,
    "disposition" "SaleReturnDisposition" NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "lineCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalMovementId" UUID,
    "reversalIdempotencyKey" TEXT,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnLine" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "purchaseReturnId" UUID NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "receiptLineId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "variantCode" TEXT,
    "variantAttributes" JSONB,
    "purchaseQuantity" DECIMAL(18,4) NOT NULL,
    "purchaseUnit" "MeasurementUnit" NOT NULL,
    "conversionFactor" DECIMAL(18,8) NOT NULL,
    "conversionPrecision" INTEGER NOT NULL,
    "roundingMode" "RoundingMode" NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "purchaseUnitCost" DECIMAL(14,4) NOT NULL,
    "stockUnitCost" DECIMAL(14,4) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleReturn_businessUnitId_saleId_createdAt_idx" ON "SaleReturn"("businessUnitId", "saleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_id_key" ON "SaleReturn"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_id_saleId_key" ON "SaleReturn"("businessUnitId", "id", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_stockMovementId_key" ON "SaleReturn"("businessUnitId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_reversalMovementId_key" ON "SaleReturn"("businessUnitId", "reversalMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_reversalIdempotencyKey_key" ON "SaleReturn"("businessUnitId", "reversalIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_creditNoteNumber_key" ON "SaleReturn"("businessUnitId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_businessUnitId_idempotencyKey_key" ON "SaleReturn"("businessUnitId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SaleReturnLine_businessUnitId_saleLineId_idx" ON "SaleReturnLine"("businessUnitId", "saleLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturnLine_businessUnitId_saleReturnId_lineNumber_key" ON "SaleReturnLine"("businessUnitId", "saleReturnId", "lineNumber");

-- CreateIndex
CREATE INDEX "PurchaseReturn_businessUnitId_purchaseReceiptId_createdAt_idx" ON "PurchaseReturn"("businessUnitId", "purchaseReceiptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_id_key" ON "PurchaseReturn"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_id_purchaseReceiptId_key" ON "PurchaseReturn"("businessUnitId", "id", "purchaseReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_stockMovementId_key" ON "PurchaseReturn"("businessUnitId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_reversalMovementId_key" ON "PurchaseReturn"("businessUnitId", "reversalMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_reversalIdempotencyKey_key" ON "PurchaseReturn"("businessUnitId", "reversalIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_debitNoteNumber_key" ON "PurchaseReturn"("businessUnitId", "debitNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_businessUnitId_idempotencyKey_key" ON "PurchaseReturn"("businessUnitId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseReturnLine_businessUnitId_receiptLineId_idx" ON "PurchaseReturnLine"("businessUnitId", "receiptLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturnLine_businessUnitId_purchaseReturnId_lineNumb_key" ON "PurchaseReturnLine"("businessUnitId", "purchaseReturnId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_businessUnitId_purchaseReceiptId_id_key" ON "PurchaseReceiptLine"("businessUnitId", "purchaseReceiptId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SaleLine_businessUnitId_saleId_id_key" ON "SaleLine"("businessUnitId", "saleId", "id");

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessUnitId_saleId_fkey" FOREIGN KEY ("businessUnitId", "saleId") REFERENCES "Sale"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessUnitId_stockMovementId_fkey" FOREIGN KEY ("businessUnitId", "stockMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessUnitId_reversalMovementId_fkey" FOREIGN KEY ("businessUnitId", "reversalMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_businessUnitId_saleReturnId_saleId_fkey" FOREIGN KEY ("businessUnitId", "saleReturnId", "saleId") REFERENCES "SaleReturn"("businessUnitId", "id", "saleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_businessUnitId_saleId_saleLineId_fkey" FOREIGN KEY ("businessUnitId", "saleId", "saleLineId") REFERENCES "SaleLine"("businessUnitId", "saleId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_businessUnitId_purchaseReceiptId_fkey" FOREIGN KEY ("businessUnitId", "purchaseReceiptId") REFERENCES "PurchaseReceipt"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_businessUnitId_stockMovementId_fkey" FOREIGN KEY ("businessUnitId", "stockMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_businessUnitId_reversalMovementId_fkey" FOREIGN KEY ("businessUnitId", "reversalMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_businessUnitId_purchaseReturnId_purchas_fkey" FOREIGN KEY ("businessUnitId", "purchaseReturnId", "purchaseReceiptId") REFERENCES "PurchaseReturn"("businessUnitId", "id", "purchaseReceiptId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_businessUnitId_purchaseReceiptId_receip_fkey" FOREIGN KEY ("businessUnitId", "purchaseReceiptId", "receiptLineId") REFERENCES "PurchaseReceiptLine"("businessUnitId", "purchaseReceiptId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
