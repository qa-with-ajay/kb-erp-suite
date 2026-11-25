-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'GROUP_ADMIN', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'UNIT_MANAGER');

-- CreateEnum
CREATE TYPE "BusinessUnits" AS ENUM ('KB_INTERIORS', 'KB_ELECTRICALS', 'KB_FURNITURE', 'KB_KITCHEN_BATH', 'KB_TOOLS', 'KB_TECH');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('PCS', 'SQFT', 'BOX', 'RFT', 'ROLL', 'METER', 'KG', 'LITRE', 'BUNDLE', 'SET');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CASHIER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "legalName" TEXT,
    "tradeName" TEXT NOT NULL DEFAULT 'KB Interiors',
    "unit" "BusinessUnits" NOT NULL DEFAULT 'KB_INTERIORS',
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'KBI',
    "nextInvoiceNo" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'MATERIAL');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN', 'DOWN', 'UP');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE_IN', 'INWARD', 'OUTWARD', 'ADJUSTMENT', 'TRANSFER', 'MATERIAL_PROCESSING');

-- CreateEnum
CREATE TYPE "StockKind" AS ENUM ('STANDARD', 'REMNANT');

-- CreateEnum
CREATE TYPE "MaterialProcessingType" AS ENUM ('CUT', 'REMNANT_SALE', 'WASTAGE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MaterialRemnantStatus" AS ENUM ('AVAILABLE', 'SOLD', 'CONSUMED', 'WASTED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "MaterialRemnantMovementType" AS ENUM ('CREATED', 'SOLD', 'CONSUMED', 'WASTED', 'ADJUSTED');

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
CREATE TABLE "MaterialProcessing" (
    "id" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "sourceRemnantId" UUID,
    "type" "MaterialProcessingType" NOT NULL,
    "inputLength" DECIMAL(12,4) NOT NULL,
    "inputWidth" DECIMAL(12,4) NOT NULL,
    "soldArea" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "wastedArea" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRemnant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "locationId" UUID NOT NULL,
    "sourceOperationId" UUID NOT NULL,
    "length" DECIMAL(12,4) NOT NULL,
    "width" DECIMAL(12,4) NOT NULL,
    "area" DECIMAL(14,4) NOT NULL,
    "status" "MaterialRemnantStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRemnant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRemnantMovement" (
    "id" UUID NOT NULL,
    "remnantId" UUID NOT NULL,
    "operationId" UUID,
    "locationId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "MaterialRemnantMovementType" NOT NULL,
    "quantityDelta" DECIMAL(14,4) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRemnantMovement_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "MaterialProcessing_movementId_key" ON "MaterialProcessing"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProcessing_sourceRemnantId_key" ON "MaterialProcessing"("sourceRemnantId");

-- CreateIndex
CREATE INDEX "MaterialProcessing_productId_createdAt_idx" ON "MaterialProcessing"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRemnant_code_key" ON "MaterialRemnant"("code");

-- CreateIndex
CREATE INDEX "MaterialRemnant_productId_variantId_status_idx" ON "MaterialRemnant"("productId", "variantId", "status");

-- CreateIndex
CREATE INDEX "MaterialRemnant_locationId_status_idx" ON "MaterialRemnant"("locationId", "status");

-- CreateIndex
CREATE INDEX "MaterialRemnantMovement_remnantId_createdAt_idx" ON "MaterialRemnantMovement"("remnantId", "createdAt");

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
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_sourceRemnantId_fkey" FOREIGN KEY ("sourceRemnantId") REFERENCES "MaterialRemnant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_sourceOperationId_fkey" FOREIGN KEY ("sourceOperationId") REFERENCES "MaterialProcessing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_remnantId_fkey" FOREIGN KEY ("remnantId") REFERENCES "MaterialRemnant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "MaterialProcessing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

ALTER TABLE "MaterialProcessing"
ADD CONSTRAINT "MaterialProcessing_valid_dimensions_check"
CHECK ("inputLength" > 0 AND "inputWidth" > 0 AND "soldArea" >= 0 AND "wastedArea" >= 0);

ALTER TABLE "MaterialRemnant"
ADD CONSTRAINT "MaterialRemnant_valid_dimensions_check"
CHECK (
  "length" > 0 AND "width" > 0 AND "area" > 0
  AND "area" = round("length" * "width", 4)
);

ALTER TABLE "MaterialRemnantMovement"
ADD CONSTRAINT "MaterialRemnantMovement_nonzero_quantity_check"
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

CREATE TRIGGER "MaterialProcessing_immutable"
BEFORE UPDATE OR DELETE ON "MaterialProcessing"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

CREATE TRIGGER "MaterialRemnantMovement_immutable"
BEFORE UPDATE OR DELETE ON "MaterialRemnantMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

INSERT INTO "StockLocation" ("id", "name", "code", "isActive", "createdAt", "updatedAt")
VALUES ('f3ec263a-cf32-4e31-b57d-8a57e2a49460', 'Main Store', 'MAIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GROUP', 'BUSINESS_UNIT');

-- DropForeignKey
ALTER TABLE "MaterialProcessing" DROP CONSTRAINT "MaterialProcessing_movementId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialProcessing" DROP CONSTRAINT "MaterialProcessing_productId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialProcessing" DROP CONSTRAINT "MaterialProcessing_sourceRemnantId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialProcessing" DROP CONSTRAINT "MaterialProcessing_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_brandId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitConversion" DROP CONSTRAINT "ProductUnitConversion_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnant" DROP CONSTRAINT "MaterialRemnant_locationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnant" DROP CONSTRAINT "MaterialRemnant_productId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnant" DROP CONSTRAINT "MaterialRemnant_sourceOperationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnant" DROP CONSTRAINT "MaterialRemnant_variantId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnantMovement" DROP CONSTRAINT "MaterialRemnantMovement_locationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnantMovement" DROP CONSTRAINT "MaterialRemnantMovement_operationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialRemnantMovement" DROP CONSTRAINT "MaterialRemnantMovement_remnantId_fkey";

-- DropForeignKey
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_locationId_fkey";

-- DropForeignKey
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_variantId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedgerEntry" DROP CONSTRAINT "StockLedgerEntry_locationId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedgerEntry" DROP CONSTRAINT "StockLedgerEntry_movementId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedgerEntry" DROP CONSTRAINT "StockLedgerEntry_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedgerEntry" DROP CONSTRAINT "StockLedgerEntry_variantId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_destinationLocationId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_sourceLocationId_fkey";

-- DropIndex
DROP INDEX "Brand_isActive_name_idx";

-- DropIndex
DROP INDEX "Brand_name_key";

-- DropIndex
DROP INDEX "Category_isActive_name_idx";

-- DropIndex
DROP INDEX "Category_name_key";

-- DropIndex
DROP INDEX "MaterialProcessing_productId_createdAt_idx";

-- DropIndex
DROP INDEX "Product_barcode_key";

-- DropIndex
DROP INDEX "Product_brandId_isActive_idx";

-- DropIndex
DROP INDEX "Product_categoryId_isActive_idx";

-- DropIndex
DROP INDEX "Product_name_idx";

-- DropIndex
DROP INDEX "Product_sku_key";

-- DropIndex
DROP INDEX "ProductVariant_barcode_key";

-- DropIndex
DROP INDEX "ProductVariant_code_key";

-- DropIndex
DROP INDEX "ProductVariant_productId_isActive_idx";

-- DropIndex
DROP INDEX "MaterialRemnant_code_key";

-- DropIndex
DROP INDEX "MaterialRemnant_locationId_status_idx";

-- DropIndex
DROP INDEX "MaterialRemnant_productId_variantId_status_idx";

-- DropIndex
DROP INDEX "MaterialRemnantMovement_remnantId_createdAt_idx";

-- DropIndex
DROP INDEX "StockBalance_locationId_productId_variantId_stockKind_idx";

-- DropIndex
DROP INDEX "StockLedgerEntry_productId_variantId_locationId_createdAt_idx";

-- DropIndex
DROP INDEX "StockLocation_code_key";

-- DropIndex
DROP INDEX "StockLocation_name_key";

-- DropIndex
DROP INDEX "StockMovement_idempotencyKey_key";

-- DropIndex
DROP INDEX "StockMovement_type_createdAt_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "MaterialProcessing" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "ProductUnitConversion" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "MaterialRemnant" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "MaterialRemnantMovement" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "StockBalance" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "StockLedgerEntry" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "StockLocation" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "businessUnitId" UUID;

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Kumar Brothers & Associates',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserGroupRole" (
    "userId" TEXT NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserGroupRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserBusinessUnitRole" (
    "userId" TEXT NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserBusinessUnitRole_pkey" PRIMARY KEY ("userId","businessUnitId","roleId")
);

INSERT INTO "BusinessUnit" ("id", "code", "name", "isActive", "createdAt", "updatedAt") VALUES
    ('11111111-1111-4111-8111-111111111111', 'KB_INTERIORS', 'KB Interiors', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('22222222-2222-4222-8222-222222222222', 'KB_ELECTRICALS', 'KB Electricals', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333333', 'KB_KITCHEN_BATH', 'KB Kitchen & Bath', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('44444444-4444-4444-8444-444444444444', 'KB_TOOLS', 'KB Tools', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('55555555-5555-4555-8555-555555555555', 'KB_TECH', 'KB Tech', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('66666666-6666-4666-8666-666666666666', 'KB_FURNITURE', 'KB Furniture', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "BusinessProfile"
SET "businessUnitId" = CASE "unit"
    WHEN 'KB_ELECTRICALS' THEN '22222222-2222-4222-8222-222222222222'::uuid
    WHEN 'KB_KITCHEN_BATH' THEN '33333333-3333-4333-8333-333333333333'::uuid
    WHEN 'KB_TOOLS' THEN '44444444-4444-4444-8444-444444444444'::uuid
    WHEN 'KB_TECH' THEN '55555555-5555-4555-8555-555555555555'::uuid
    WHEN 'KB_FURNITURE' THEN '66666666-6666-4666-8666-666666666666'::uuid
    ELSE '11111111-1111-4111-8111-111111111111'::uuid
END
WHERE "businessUnitId" IS NULL;

UPDATE "AuditLog" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid
WHERE "businessUnitId" IS NULL;
UPDATE "Brand" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "Category" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "MaterialProcessing" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "Product" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "ProductUnitConversion" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "ProductVariant" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "MaterialRemnant" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "MaterialRemnantMovement" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockBalance" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockLedgerEntry" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockLocation" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockMovement" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;

ALTER TABLE "Brand" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "BusinessProfile" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "MaterialProcessing" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "ProductUnitConversion" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "MaterialRemnant" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "MaterialRemnantMovement" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "StockBalance" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "StockLedgerEntry" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "StockLocation" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "businessUnitId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_code_key" ON "BusinessUnit"("code");

-- CreateIndex
CREATE INDEX "BusinessUnit_isActive_name_idx" ON "BusinessUnit"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserBusinessUnitRole_businessUnitId_roleId_idx" ON "UserBusinessUnitRole"("businessUnitId", "roleId");

-- CreateIndex
CREATE INDEX "AuditLog_businessUnitId_createdAt_idx" ON "AuditLog"("businessUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "Brand_businessUnitId_isActive_name_idx" ON "Brand"("businessUnitId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_businessUnitId_name_key" ON "Brand"("businessUnitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_businessUnitId_id_key" ON "Brand"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_businessUnitId_key" ON "BusinessProfile"("businessUnitId");

-- CreateIndex
CREATE INDEX "Category_businessUnitId_isActive_name_idx" ON "Category"("businessUnitId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessUnitId_name_key" ON "Category"("businessUnitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessUnitId_id_key" ON "Category"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "MaterialProcessing_businessUnitId_productId_createdAt_idx" ON "MaterialProcessing"("businessUnitId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProcessing_businessUnitId_id_key" ON "MaterialProcessing"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProcessing_businessUnitId_movementId_key" ON "MaterialProcessing"("businessUnitId", "movementId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProcessing_businessUnitId_sourceRemnantId_key" ON "MaterialProcessing"("businessUnitId", "sourceRemnantId");

-- CreateIndex
CREATE INDEX "Product_businessUnitId_name_idx" ON "Product"("businessUnitId", "name");

-- CreateIndex
CREATE INDEX "Product_businessUnitId_categoryId_isActive_idx" ON "Product"("businessUnitId", "categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_businessUnitId_brandId_isActive_idx" ON "Product"("businessUnitId", "brandId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessUnitId_sku_key" ON "Product"("businessUnitId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessUnitId_barcode_key" ON "Product"("businessUnitId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessUnitId_id_key" ON "Product"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "ProductUnitConversion_businessUnitId_productId_idx" ON "ProductUnitConversion"("businessUnitId", "productId");

-- CreateIndex
CREATE INDEX "ProductVariant_businessUnitId_productId_isActive_idx" ON "ProductVariant"("businessUnitId", "productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_businessUnitId_code_key" ON "ProductVariant"("businessUnitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_businessUnitId_barcode_key" ON "ProductVariant"("businessUnitId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_businessUnitId_id_key" ON "ProductVariant"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "MaterialRemnant_businessUnitId_productId_variantId_status_idx" ON "MaterialRemnant"("businessUnitId", "productId", "variantId", "status");

-- CreateIndex
CREATE INDEX "MaterialRemnant_businessUnitId_locationId_status_idx" ON "MaterialRemnant"("businessUnitId", "locationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRemnant_businessUnitId_code_key" ON "MaterialRemnant"("businessUnitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRemnant_businessUnitId_id_key" ON "MaterialRemnant"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "MaterialRemnantMovement_businessUnitId_remnantId_createdAt_idx" ON "MaterialRemnantMovement"("businessUnitId", "remnantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockBalance_businessUnitId_locationId_productId_variantId__idx" ON "StockBalance"("businessUnitId", "locationId", "productId", "variantId", "stockKind");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_businessUnitId_productId_variantId_locatio_idx" ON "StockLedgerEntry"("businessUnitId", "productId", "variantId", "locationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_businessUnitId_name_key" ON "StockLocation"("businessUnitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_businessUnitId_code_key" ON "StockLocation"("businessUnitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_businessUnitId_id_key" ON "StockLocation"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "StockMovement_businessUnitId_type_createdAt_idx" ON "StockMovement"("businessUnitId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_businessUnitId_idempotencyKey_key" ON "StockMovement"("businessUnitId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_businessUnitId_id_key" ON "StockMovement"("businessUnitId", "id");

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupRole" ADD CONSTRAINT "UserGroupRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroupRole" ADD CONSTRAINT "UserGroupRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBusinessUnitRole" ADD CONSTRAINT "UserBusinessUnitRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBusinessUnitRole" ADD CONSTRAINT "UserBusinessUnitRole_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBusinessUnitRole" ADD CONSTRAINT "UserBusinessUnitRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessUnitId_categoryId_fkey" FOREIGN KEY ("businessUnitId", "categoryId") REFERENCES "Category"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessUnitId_brandId_fkey" FOREIGN KEY ("businessUnitId", "brandId") REFERENCES "Brand"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_businessUnitId_sourceLocationId_fkey" FOREIGN KEY ("businessUnitId", "sourceLocationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_businessUnitId_destinationLocationId_fkey" FOREIGN KEY ("businessUnitId", "destinationLocationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessUnitId_movementId_fkey" FOREIGN KEY ("businessUnitId", "movementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_businessUnitId_movementId_fkey" FOREIGN KEY ("businessUnitId", "movementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialProcessing" ADD CONSTRAINT "MaterialProcessing_businessUnitId_sourceRemnantId_fkey" FOREIGN KEY ("businessUnitId", "sourceRemnantId") REFERENCES "MaterialRemnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnant" ADD CONSTRAINT "MaterialRemnant_businessUnitId_sourceOperationId_fkey" FOREIGN KEY ("businessUnitId", "sourceOperationId") REFERENCES "MaterialProcessing"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_businessUnitId_remnantId_fkey" FOREIGN KEY ("businessUnitId", "remnantId") REFERENCES "MaterialRemnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_businessUnitId_operationId_fkey" FOREIGN KEY ("businessUnitId", "operationId") REFERENCES "MaterialProcessing"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRemnantMovement" ADD CONSTRAINT "MaterialRemnantMovement_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationProfile" ("id", "name", "createdAt", "updatedAt")
VALUES ('99999999-9999-4999-8999-999999999999', 'Kumar Brothers & Associates', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "BusinessProfile" ("id", "tradeName", "unit", "businessUnitId", "invoicePrefix", "nextInvoiceNo", "currency", "createdAt", "updatedAt")
SELECT seed."id", seed."tradeName", seed."unit"::"BusinessUnits", seed."businessUnitId"::uuid, seed."invoicePrefix", 1, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('seed-profile-electricals', 'KB Electricals', 'KB_ELECTRICALS', '22222222-2222-4222-8222-222222222222', 'KBE'),
    ('seed-profile-kitchen-bath', 'KB Kitchen & Bath', 'KB_KITCHEN_BATH', '33333333-3333-4333-8333-333333333333', 'KBK'),
    ('seed-profile-tools', 'KB Tools', 'KB_TOOLS', '44444444-4444-4444-8444-444444444444', 'KBT'),
    ('seed-profile-tech', 'KB Tech', 'KB_TECH', '55555555-5555-4555-8555-555555555555', 'KBTECH'),
    ('seed-profile-interiors', 'KB Interiors', 'KB_INTERIORS', '11111111-1111-4111-8111-111111111111', 'KBI'),
    ('kb-furniture-profile', 'KB Furniture', 'KB_FURNITURE', '66666666-6666-4666-8666-666666666666', 'KBF')
) AS seed("id", "tradeName", "unit", "businessUnitId", "invoicePrefix")
WHERE NOT EXISTS (
    SELECT 1 FROM "BusinessProfile" profile
    WHERE profile."businessUnitId" = seed."businessUnitId"::uuid
);

-- KB Furniture's operational stock location (Interiors' MAIN location is created at the top of this file).
INSERT INTO "StockLocation" ("id", "name", "code", "isActive", "createdAt", "updatedAt", "businessUnitId")
VALUES ('66666666-6666-4666-8666-666666666667', 'Main Store', 'MAIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '66666666-6666-4666-8666-666666666666');

INSERT INTO "Role" ("id", "code", "name", "scope", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'GROUP_ADMIN', 'Group Admin', 'GROUP', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'UNIT_MANAGER', 'Unit Manager', 'BUSINESS_UNIT', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ACCOUNTANT', 'Accountant', 'BUSINESS_UNIT', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'INVENTORY_MANAGER', 'Inventory Manager', 'BUSINESS_UNIT', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'CASHIER', 'Cashier', 'BUSINESS_UNIT', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Permission" ("id", "code", "description", "createdAt") VALUES
    ('10000000-0000-4000-8000-000000000001', 'group.dashboard.read', 'View consolidated group dashboards.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000002', 'businessUnits.manage', 'Create and configure business units.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000003', 'users.manage', 'Manage users and their role assignments.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000004', 'reports.consolidated.read', 'View consolidated group reports.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000005', 'reports.unit.read', 'View reports for an assigned business unit.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000006', 'inventory.read', 'View inventory catalogue and stock.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000007', 'inventory.manage', 'Manage inventory catalogue and stock.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000008', 'billing.read', 'View invoices and billing records.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000009', 'billing.manage', 'Create and manage invoices.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000010', 'finance.read', 'View financial data and payment records.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000011', 'purchases.manage', 'Manage purchases and supplier payments.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000012', 'expenses.manage', 'Manage unit expenses.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000013', 'customers.manage', 'Manage customer records.', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000014', 'suppliers.manage', 'Manage supplier records.', CURRENT_TIMESTAMP);

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."code" = 'GROUP_ADMIN';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."code" = 'UNIT_MANAGER'
  AND permission."code" IN ('reports.unit.read', 'inventory.read', 'inventory.manage', 'billing.read', 'billing.manage', 'finance.read', 'purchases.manage', 'expenses.manage', 'customers.manage', 'suppliers.manage');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."code" = 'ACCOUNTANT'
  AND permission."code" IN ('reports.unit.read', 'billing.read', 'billing.manage', 'finance.read', 'purchases.manage', 'expenses.manage');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."code" = 'INVENTORY_MANAGER'
  AND permission."code" IN ('reports.unit.read', 'inventory.read', 'inventory.manage', 'purchases.manage');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."code" = 'CASHIER'
  AND permission."code" IN ('inventory.read', 'billing.read', 'billing.manage', 'customers.manage');

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
ALTER TABLE "SaleLine" ADD COLUMN "lineNumber" INTEGER;

WITH numbered_lines AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "businessUnitId", "saleId" ORDER BY "id")::INTEGER AS "lineNumber"
  FROM "SaleLine"
)
UPDATE "SaleLine" line
SET "lineNumber" = numbered_lines."lineNumber"
FROM numbered_lines
WHERE line."id" = numbered_lines."id";

ALTER TABLE "SaleLine" ALTER COLUMN "lineNumber" SET NOT NULL;
CREATE UNIQUE INDEX "SaleLine_businessUnitId_saleId_lineNumber_key"
  ON "SaleLine"("businessUnitId", "saleId", "lineNumber");
ALTER TABLE "SaleLine" ALTER COLUMN "lineNumber" SET DEFAULT 0;
-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessUnitId_id_key" ON "Customer"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "Customer_businessUnitId_isActive_name_idx" ON "Customer"("businessUnitId", "isActive", "name");

-- CreateIndex
CREATE INDEX "Customer_businessUnitId_phone_idx" ON "Customer"("businessUnitId", "phone");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_businessUnitId_id_key" ON "Supplier"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "Supplier_businessUnitId_isActive_name_idx" ON "Supplier"("businessUnitId", "isActive", "name");

-- CreateIndex
CREATE INDEX "Supplier_businessUnitId_phone_idx" ON "Supplier"("businessUnitId", "phone");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD COLUMN "customerId" UUID;
CREATE INDEX "Sale_businessUnitId_customerId_idx" ON "Sale"("businessUnitId", "customerId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessUnitId_customerId_fkey"
  FOREIGN KEY ("businessUnitId", "customerId") REFERENCES "Customer"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
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
ALTER TABLE "PurchaseOrderLine"
ADD COLUMN "conversionFactor" DECIMAL(18,8),
ADD COLUMN "conversionPrecision" INTEGER,
ADD COLUMN "purchaseQuantity" DECIMAL(18,4),
ADD COLUMN "purchaseUnit" "MeasurementUnit",
ADD COLUMN "purchaseUnitCost" DECIMAL(14,4),
ADD COLUMN "receivedPurchaseQuantity" DECIMAL(18,4),
ADD COLUMN "roundingMode" "RoundingMode";

UPDATE "PurchaseOrderLine"
SET "conversionFactor" = 1,
    "conversionPrecision" = 4,
    "purchaseQuantity" = "quantity",
    "purchaseUnit" = "baseUnit",
    "purchaseUnitCost" = "unitCost",
    "receivedPurchaseQuantity" = "receivedQuantity",
    "roundingMode" = 'HALF_UP';

ALTER TABLE "PurchaseOrderLine"
ALTER COLUMN "conversionFactor" SET NOT NULL,
ALTER COLUMN "conversionPrecision" SET NOT NULL,
ALTER COLUMN "purchaseQuantity" SET NOT NULL,
ALTER COLUMN "purchaseUnit" SET NOT NULL,
ALTER COLUMN "purchaseUnitCost" SET NOT NULL,
ALTER COLUMN "receivedPurchaseQuantity" SET NOT NULL,
ALTER COLUMN "receivedPurchaseQuantity" SET DEFAULT 0,
ALTER COLUMN "roundingMode" SET NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "receivedQuantity" SET DATA TYPE DECIMAL(18,8);

ALTER TABLE "PurchaseReceiptLine"
ADD COLUMN "conversionFactor" DECIMAL(18,8),
ADD COLUMN "conversionPrecision" INTEGER,
ADD COLUMN "purchaseQuantity" DECIMAL(18,4),
ADD COLUMN "purchaseUnit" "MeasurementUnit",
ADD COLUMN "purchaseUnitCost" DECIMAL(14,4),
ADD COLUMN "roundingMode" "RoundingMode";

UPDATE "PurchaseReceiptLine"
SET "conversionFactor" = 1,
    "conversionPrecision" = 4,
    "purchaseQuantity" = "quantity",
    "purchaseUnit" = "baseUnit",
    "purchaseUnitCost" = "unitCost",
    "roundingMode" = 'HALF_UP';

ALTER TABLE "PurchaseReceiptLine"
ALTER COLUMN "conversionFactor" SET NOT NULL,
ALTER COLUMN "conversionPrecision" SET NOT NULL,
ALTER COLUMN "purchaseQuantity" SET NOT NULL,
ALTER COLUMN "purchaseUnit" SET NOT NULL,
ALTER COLUMN "purchaseUnitCost" SET NOT NULL,
ALTER COLUMN "roundingMode" SET NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

ALTER TABLE "StockBalance"
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,8);

ALTER TABLE "StockLedgerEntry"
ALTER COLUMN "quantityDelta" SET DATA TYPE DECIMAL(18,8);
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "saleId" UUID,
    "purchaseReceiptId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_exactly_one_target_check" CHECK (
      ("saleId" IS NOT NULL AND "purchaseReceiptId" IS NULL)
      OR ("saleId" IS NULL AND "purchaseReceiptId" IS NOT NULL)
    ),
    CONSTRAINT "Payment_positive_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "Payment_reversal_fields_check" CHECK (
      ("reversedAt" IS NULL AND "reversedBy" IS NULL AND "reversalReason" IS NULL)
      OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "Payment_businessUnitId_id_key" ON "Payment"("businessUnitId", "id");
CREATE UNIQUE INDEX "Payment_businessUnitId_idempotencyKey_key" ON "Payment"("businessUnitId", "idempotencyKey");
CREATE INDEX "Payment_businessUnitId_saleId_paidAt_idx" ON "Payment"("businessUnitId", "saleId", "paidAt");
CREATE INDEX "Payment_businessUnitId_purchaseReceiptId_paidAt_idx" ON "Payment"("businessUnitId", "purchaseReceiptId", "paidAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_saleId_fkey"
  FOREIGN KEY ("businessUnitId", "saleId") REFERENCES "Sale"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_purchaseReceiptId_fkey"
  FOREIGN KEY ("businessUnitId", "purchaseReceiptId") REFERENCES "PurchaseReceipt"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversedBy_fkey"
  FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
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
INSERT INTO "Permission" ("id", "code", "description", "createdAt")
VALUES (
  '10000000-0000-4000-8000-000000000015',
  'roles.manage',
  'Create and configure custom roles and their permissions.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'GROUP_ADMIN'
  AND permission."code" = 'roles.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
-- CreateTable
CREATE TABLE "LowStockNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LowStockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LowStockNotification_userId_businessUnitId_isRead_idx" ON "LowStockNotification"("userId", "businessUnitId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "LowStockNotification_userId_businessUnitId_productId_key" ON "LowStockNotification"("userId", "businessUnitId", "productId");

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TYPE "BarcodeType" AS ENUM ('INTERNAL', 'MANUFACTURER');
ALTER TABLE "Product" ADD COLUMN "barcodeType" "BarcodeType" NOT NULL DEFAULT 'INTERNAL';
UPDATE "Product" SET "barcodeType" = 'MANUFACTURER' WHERE "barcode" IS NOT NULL;
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
ADD CONSTRAINT "PasswordResetToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD COLUMN "isProcessingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MaterialProcessing" ALTER COLUMN "inputLength" DROP NOT NULL, ALTER COLUMN "inputWidth" DROP NOT NULL, ADD COLUMN "inputQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0, ADD COLUMN "inputUnit" "MeasurementUnit";
ALTER TABLE "MaterialRemnant" ALTER COLUMN "sourceOperationId" DROP NOT NULL, ALTER COLUMN "length" DROP NOT NULL, ALTER COLUMN "width" DROP NOT NULL, ALTER COLUMN "area" DROP NOT NULL, ADD COLUMN "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0, ADD COLUMN "unit" "MeasurementUnit";
ALTER TYPE "MaterialRemnantMovementType" ADD VALUE IF NOT EXISTS 'TRANSFERRED';
ALTER TABLE "MaterialProcessing" ADD COLUMN "wastedQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "SaleLine" ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Product"
ADD COLUMN "materialUnit" "MeasurementUnit",
ADD COLUMN "materialUnitsPerBaseUnit" DECIMAL(18,8);

ALTER TABLE "Product"
ADD CONSTRAINT "Product_material_unit_factor_pair_check"
CHECK (("materialUnit" IS NULL AND "materialUnitsPerBaseUnit" IS NULL)
  OR ("materialUnit" IS NOT NULL AND "materialUnitsPerBaseUnit" IS NOT NULL AND "materialUnitsPerBaseUnit" > 0 AND "materialUnit" <> "baseUnit"));
ALTER TABLE "MaterialProcessing"
  ADD COLUMN "consumedQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "outputUnit" "MeasurementUnit";

ALTER TABLE "MaterialRemnant"
  ADD COLUMN "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0;
-- The allocation relation is tenant-scoped and references SaleLine by (businessUnitId, id).
-- SaleLine.id is globally unique, so this composite key is guaranteed unique as well.
CREATE UNIQUE INDEX IF NOT EXISTS "SaleLine_businessUnitId_id_key"
  ON "SaleLine"("businessUnitId", "id");

CREATE TABLE "SaleLineStockAllocation" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "saleLineId" UUID NOT NULL,
  "sourceType" "StockKind" NOT NULL,
  "stockBalanceId" UUID,
  "remnantId" UUID,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" "MeasurementUnit" NOT NULL,
  "conversionFactor" DECIMAL(18,8) NOT NULL,
  "baseQuantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "lineCost" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleLineStockAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleLineStockAllocation_businessUnitId_saleLineId_fkey" FOREIGN KEY ("businessUnitId", "saleLineId") REFERENCES "SaleLine"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "SaleLineStockAllocation_businessUnitId_remnantId_fkey" FOREIGN KEY ("businessUnitId", "remnantId") REFERENCES "MaterialRemnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleLineStockAllocation_source_check" CHECK (
    ("sourceType" = 'STANDARD' AND "stockBalanceId" IS NOT NULL AND "remnantId" IS NULL)
    OR ("sourceType" = 'REMNANT' AND "remnantId" IS NOT NULL AND "stockBalanceId" IS NULL)
  )
);
CREATE UNIQUE INDEX "SaleLineStockAllocation_businessUnitId_id_key" ON "SaleLineStockAllocation"("businessUnitId", "id");
CREATE INDEX "SaleLineStockAllocation_businessUnitId_saleLineId_idx" ON "SaleLineStockAllocation"("businessUnitId", "saleLineId");
CREATE INDEX "SaleLineStockAllocation_businessUnitId_sourceType_remnantId_idx" ON "SaleLineStockAllocation"("businessUnitId", "sourceType", "remnantId");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StockBalance_businessUnitId_id_key" ON "StockBalance"("businessUnitId", "id");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_businessUnitId_stockBalanceId_fkey"
  FOREIGN KEY ("businessUnitId", "stockBalanceId")
  REFERENCES "StockBalance"("businessUnitId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SaleLineStockAllocation_businessUnitId_stockBalanceId_idx"
  ON "SaleLineStockAllocation"("businessUnitId", "stockBalanceId");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_positive_quantities_check"
  CHECK ("quantity" > 0 AND "conversionFactor" > 0 AND "baseQuantity" > 0);
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_nonnegative_costs_check"
  CHECK ("unitCost" >= 0 AND "lineCost" >= 0);
DROP INDEX IF EXISTS "MaterialProcessing_sourceRemnantId_key";
DROP INDEX IF EXISTS "MaterialProcessing_businessUnitId_sourceRemnantId_key";
CREATE INDEX IF NOT EXISTS "MaterialProcessing_businessUnitId_sourceRemnantId_createdAt_idx"
  ON "MaterialProcessing"("businessUnitId", "sourceRemnantId", "createdAt");
ALTER TABLE "SaleReturnLine"
  ADD COLUMN "sourceAllocationId" UUID,
  ADD COLUMN "sourceType" "StockKind",
  ADD COLUMN "allocationQuantity" DECIMAL(18,4),
  ADD COLUMN "allocationUnit" "MeasurementUnit",
  ADD COLUMN "baseQuantity" DECIMAL(18,4);

CREATE UNIQUE INDEX "SaleReturnLine_businessUnitId_id_key"
  ON "SaleReturnLine"("businessUnitId", "id");

ALTER TABLE "SaleReturnLine"
  ADD CONSTRAINT "SaleReturnLine_businessUnitId_sourceAllocationId_fkey"
  FOREIGN KEY ("businessUnitId", "sourceAllocationId")
  REFERENCES "SaleLineStockAllocation"("businessUnitId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "MaterialRemnantMovementType" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "MaterialRemnantMovementType" ADD VALUE IF NOT EXISTS 'RETURN_REVERSED';

CREATE INDEX "SaleReturnLine_businessUnitId_sourceAllocationId_idx"
  ON "SaleReturnLine"("businessUnitId", "sourceAllocationId");

ALTER TABLE "SaleReturnLine"
  ADD CONSTRAINT "SaleReturnLine_sourceAllocationLineage_check"
  CHECK (
    (
      "sourceAllocationId" IS NULL
      AND "sourceType" IS NULL
      AND "allocationQuantity" IS NULL
      AND "allocationUnit" IS NULL
      AND "baseQuantity" IS NULL
    )
    OR
    (
      "sourceAllocationId" IS NOT NULL
      AND "sourceType" IS NOT NULL
      AND "allocationQuantity" > 0
      AND "allocationUnit" IS NOT NULL
      AND "baseQuantity" > 0
    )
  );