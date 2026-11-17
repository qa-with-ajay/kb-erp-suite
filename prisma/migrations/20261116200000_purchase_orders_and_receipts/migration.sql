-- CreateEnum
CREATE TYPE "PurchaseTaxMode" AS ENUM ('GST', 'NON_GST');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED');

-- AlterTable
ALTER TABLE "BusinessUnit" ADD COLUMN     "nextPurchaseOrderNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ORDERED',
    "taxMode" "PurchaseTaxMode" NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "variantCode" TEXT,
    "variantAttributes" JSONB,
    "quantity" DECIMAL(18,4) NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "supplierInvoiceNumber" TEXT NOT NULL,
    "supplierInvoiceDate" TIMESTAMP(3),
    "taxMode" "PurchaseTaxMode" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "baseUnit" "MeasurementUnit" NOT NULL,
    "variantCode" TEXT,
    "variantAttributes" JSONB,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_businessUnitId_status_orderDate_idx" ON "PurchaseOrder"("businessUnitId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_businessUnitId_supplierId_orderDate_idx" ON "PurchaseOrder"("businessUnitId", "supplierId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_businessUnitId_id_key" ON "PurchaseOrder"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_businessUnitId_orderNumber_key" ON "PurchaseOrder"("businessUnitId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_businessUnitId_idempotencyKey_key" ON "PurchaseOrder"("businessUnitId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_businessUnitId_productId_idx" ON "PurchaseOrderLine"("businessUnitId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_businessUnitId_id_key" ON "PurchaseOrderLine"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_businessUnitId_purchaseOrderId_lineNumber_key" ON "PurchaseOrderLine"("businessUnitId", "purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_businessUnitId_createdAt_idx" ON "PurchaseReceipt"("businessUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_businessUnitId_purchaseOrderId_idx" ON "PurchaseReceipt"("businessUnitId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_businessUnitId_id_key" ON "PurchaseReceipt"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_businessUnitId_stockMovementId_key" ON "PurchaseReceipt"("businessUnitId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_businessUnitId_supplierId_supplierInvoiceNu_key" ON "PurchaseReceipt"("businessUnitId", "supplierId", "supplierInvoiceNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_businessUnitId_purchaseOrderLineId_idx" ON "PurchaseReceiptLine"("businessUnitId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_businessUnitId_id_key" ON "PurchaseReceiptLine"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_businessUnitId_purchaseReceiptId_lineNu_key" ON "PurchaseReceiptLine"("businessUnitId", "purchaseReceiptId", "lineNumber");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_businessUnitId_supplierId_fkey" FOREIGN KEY ("businessUnitId", "supplierId") REFERENCES "Supplier"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_businessUnitId_purchaseOrderId_fkey" FOREIGN KEY ("businessUnitId", "purchaseOrderId") REFERENCES "PurchaseOrder"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_businessUnitId_stockMovementId_fkey" FOREIGN KEY ("businessUnitId", "stockMovementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_businessUnitId_purchaseOrderId_fkey" FOREIGN KEY ("businessUnitId", "purchaseOrderId") REFERENCES "PurchaseOrder"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_businessUnitId_supplierId_fkey" FOREIGN KEY ("businessUnitId", "supplierId") REFERENCES "Supplier"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_businessUnitId_purchaseReceiptId_fkey" FOREIGN KEY ("businessUnitId", "purchaseReceiptId") REFERENCES "PurchaseReceipt"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_businessUnitId_purchaseOrderLineId_fkey" FOREIGN KEY ("businessUnitId", "purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
