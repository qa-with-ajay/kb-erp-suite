-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'PANEL');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN', 'DOWN', 'UP');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE_IN', 'INWARD', 'OUTWARD', 'ADJUSTMENT', 'TRANSFER', 'PANEL_OPERATION');

-- CreateEnum
CREATE TYPE "StockKind" AS ENUM ('STANDARD', 'REMNANT');

-- CreateEnum
CREATE TYPE "PanelOperationType" AS ENUM ('CUT', 'REMNANT_SALE', 'WASTAGE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RemnantStatus" AS ENUM ('AVAILABLE', 'SOLD', 'CONSUMED', 'WASTED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "RemnantMovementType" AS ENUM ('CREATED', 'SOLD', 'CONSUMED', 'WASTED', 'ADJUSTED');

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "productType" "ProductType" NOT NULL DEFAULT 'STANDARD',
    "baseUnit" "MeasurementUnit" NOT NULL,
    "purchasePrice" DECIMAL(14,2) NOT NULL,
    "sellingPrice" DECIMAL(14,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "minimumStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" UUID,
    "brandId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "code" TEXT,
    "barcode" TEXT,
    "attributes" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitConversion" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "conversionFactor" DECIMAL(18,8) NOT NULL,
    "isPurchaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "isSalesUnit" BOOLEAN NOT NULL DEFAULT false,
    "precision" INTEGER NOT NULL DEFAULT 4,
    "roundingMode" "RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "sourceLocationId" UUID,
    "destinationLocationId" UUID,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedgerEntry" (
    "id" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "locationId" UUID NOT NULL,
    "stockKind" "StockKind" NOT NULL DEFAULT 'STANDARD',
    "quantityDelta" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "stockKind" "StockKind" NOT NULL DEFAULT 'STANDARD',
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelOperation" (
    "id" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "sourceRemnantId" UUID,
    "type" "PanelOperationType" NOT NULL,
    "inputLength" DECIMAL(12,4) NOT NULL,
    "inputWidth" DECIMAL(12,4) NOT NULL,
    "soldArea" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wastedArea" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remnant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "locationId" UUID NOT NULL,
    "sourceOperationId" UUID NOT NULL,
    "length" DECIMAL(12,4) NOT NULL,
    "width" DECIMAL(12,4) NOT NULL,
    "area" DECIMAL(14,4) NOT NULL,
    "status" "RemnantStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remnant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemnantMovement" (
    "id" UUID NOT NULL,
    "remnantId" UUID NOT NULL,
    "operationId" UUID,
    "locationId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "RemnantMovementType" NOT NULL,
    "quantityDelta" DECIMAL(14,4) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemnantMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_isActive_name_idx" ON "Category"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Brand_isActive_name_idx" ON "Brand"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_brandId_isActive_idx" ON "Product"("brandId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_code_key" ON "ProductVariant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitConversion_productId_unit_key" ON "ProductUnitConversion"("productId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_name_key" ON "StockLocation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_code_key" ON "StockLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_type_createdAt_idx" ON "StockMovement"("type", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_reference_idx" ON "StockMovement"("reference");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_productId_variantId_locationId_createdAt_idx" ON "StockLedgerEntry"("productId", "variantId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_movementId_idx" ON "StockLedgerEntry"("movementId");

-- CreateIndex
CREATE INDEX "StockBalance_locationId_productId_variantId_stockKind_idx" ON "StockBalance"("locationId", "productId", "variantId", "stockKind");

-- CreateIndex
CREATE UNIQUE INDEX "PanelOperation_movementId_key" ON "PanelOperation"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelOperation_sourceRemnantId_key" ON "PanelOperation"("sourceRemnantId");

-- CreateIndex
CREATE INDEX "PanelOperation_productId_createdAt_idx" ON "PanelOperation"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Remnant_code_key" ON "Remnant"("code");

-- CreateIndex
CREATE INDEX "Remnant_productId_variantId_status_idx" ON "Remnant"("productId", "variantId", "status");

-- CreateIndex
CREATE INDEX "Remnant_locationId_status_idx" ON "Remnant"("locationId", "status");

-- CreateIndex
CREATE INDEX "RemnantMovement_remnantId_createdAt_idx" ON "RemnantMovement"("remnantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_sourceRemnantId_fkey" FOREIGN KEY ("sourceRemnantId") REFERENCES "Remnant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_sourceOperationId_fkey" FOREIGN KEY ("sourceOperationId") REFERENCES "PanelOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_remnantId_fkey" FOREIGN KEY ("remnantId") REFERENCES "Remnant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "PanelOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "StockBalance_location_product_base_kind_key"
ON "StockBalance"("locationId", "productId", "stockKind")
WHERE "variantId" IS NULL;

CREATE UNIQUE INDEX "StockBalance_location_product_variant_kind_key"
ON "StockBalance"("locationId", "productId", "variantId", "stockKind")
WHERE "variantId" IS NOT NULL;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_nonnegative_values_check"
CHECK ("purchasePrice" >= 0 AND "sellingPrice" >= 0 AND "minimumStock" >= 0 AND "gstPercentage" BETWEEN 0 AND 100);

ALTER TABLE "ProductUnitConversion"
ADD CONSTRAINT "ProductUnitConversion_valid_conversion_check"
CHECK ("conversionFactor" > 0 AND "precision" BETWEEN 0 AND 8);

ALTER TABLE "StockLedgerEntry"
ADD CONSTRAINT "StockLedgerEntry_valid_values_check"
CHECK ("quantityDelta" <> 0 AND "unitCost" >= 0);

ALTER TABLE "StockBalance"
ADD CONSTRAINT "StockBalance_nonnegative_check"
CHECK ("quantity" >= 0 AND "averageCost" >= 0);

ALTER TABLE "PanelOperation"
ADD CONSTRAINT "PanelOperation_valid_dimensions_check"
CHECK ("inputLength" > 0 AND "inputWidth" > 0 AND "soldArea" >= 0 AND "wastedArea" >= 0);

ALTER TABLE "Remnant"
ADD CONSTRAINT "Remnant_valid_dimensions_check"
CHECK (
  "length" > 0 AND "width" > 0 AND "area" > 0
  AND "area" = round("length" * "width", 4)
);

ALTER TABLE "RemnantMovement"
ADD CONSTRAINT "RemnantMovement_nonzero_quantity_check"
CHECK ("quantityDelta" <> 0);

CREATE FUNCTION prevent_inventory_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Inventory history records are immutable';
END;
$$;

CREATE TRIGGER "StockLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "StockLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

CREATE TRIGGER "StockMovement_immutable"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

CREATE TRIGGER "PanelOperation_immutable"
BEFORE UPDATE OR DELETE ON "PanelOperation"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

CREATE TRIGGER "RemnantMovement_immutable"
BEFORE UPDATE OR DELETE ON "RemnantMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

INSERT INTO "StockLocation" ("id", "name", "code", "isActive", "createdAt", "updatedAt")
VALUES ('f3ec263a-cf32-4e31-b57d-8a57e2a49460', 'Main Store', 'MAIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
