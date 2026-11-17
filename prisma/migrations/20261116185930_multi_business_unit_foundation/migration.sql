-- CreateEnum
ALTER TYPE "BusinessUnit" RENAME TO "LegacyBusinessUnit";

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GROUP', 'BUSINESS_UNIT');

-- DropForeignKey
ALTER TABLE "PanelOperation" DROP CONSTRAINT "PanelOperation_movementId_fkey";

-- DropForeignKey
ALTER TABLE "PanelOperation" DROP CONSTRAINT "PanelOperation_productId_fkey";

-- DropForeignKey
ALTER TABLE "PanelOperation" DROP CONSTRAINT "PanelOperation_sourceRemnantId_fkey";

-- DropForeignKey
ALTER TABLE "PanelOperation" DROP CONSTRAINT "PanelOperation_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_brandId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnitConversion" DROP CONSTRAINT "ProductUnitConversion_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "Remnant" DROP CONSTRAINT "Remnant_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Remnant" DROP CONSTRAINT "Remnant_productId_fkey";

-- DropForeignKey
ALTER TABLE "Remnant" DROP CONSTRAINT "Remnant_sourceOperationId_fkey";

-- DropForeignKey
ALTER TABLE "Remnant" DROP CONSTRAINT "Remnant_variantId_fkey";

-- DropForeignKey
ALTER TABLE "RemnantMovement" DROP CONSTRAINT "RemnantMovement_locationId_fkey";

-- DropForeignKey
ALTER TABLE "RemnantMovement" DROP CONSTRAINT "RemnantMovement_operationId_fkey";

-- DropForeignKey
ALTER TABLE "RemnantMovement" DROP CONSTRAINT "RemnantMovement_remnantId_fkey";

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
DROP INDEX "PanelOperation_productId_createdAt_idx";

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
DROP INDEX "Remnant_code_key";

-- DropIndex
DROP INDEX "Remnant_locationId_status_idx";

-- DropIndex
DROP INDEX "Remnant_productId_variantId_status_idx";

-- DropIndex
DROP INDEX "RemnantMovement_remnantId_createdAt_idx";

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
ALTER TABLE "PanelOperation" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "ProductUnitConversion" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "Remnant" ADD COLUMN     "businessUnitId" UUID;

-- AlterTable
ALTER TABLE "RemnantMovement" ADD COLUMN     "businessUnitId" UUID;

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
    ('55555555-5555-4555-8555-555555555555', 'KB_TECH', 'KB Tech', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "BusinessProfile"
SET "businessUnitId" = CASE "unit"
    WHEN 'KB_ELECTRICALS' THEN '22222222-2222-4222-8222-222222222222'::uuid
    WHEN 'KB_KITCHEN_BATH' THEN '33333333-3333-4333-8333-333333333333'::uuid
    WHEN 'KB_TOOLS' THEN '44444444-4444-4444-8444-444444444444'::uuid
    WHEN 'KB_TECH' THEN '55555555-5555-4555-8555-555555555555'::uuid
    ELSE '11111111-1111-4111-8111-111111111111'::uuid
END
WHERE "businessUnitId" IS NULL;

UPDATE "AuditLog" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid
WHERE "businessUnitId" IS NULL;
UPDATE "Brand" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "Category" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "PanelOperation" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "Product" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "ProductUnitConversion" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "ProductVariant" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "Remnant" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "RemnantMovement" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockBalance" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockLedgerEntry" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockLocation" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;
UPDATE "StockMovement" SET "businessUnitId" = '11111111-1111-4111-8111-111111111111'::uuid WHERE "businessUnitId" IS NULL;

ALTER TABLE "Brand" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "BusinessProfile" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "PanelOperation" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "ProductUnitConversion" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "Remnant" ALTER COLUMN "businessUnitId" SET NOT NULL;
ALTER TABLE "RemnantMovement" ALTER COLUMN "businessUnitId" SET NOT NULL;
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
CREATE INDEX "PanelOperation_businessUnitId_productId_createdAt_idx" ON "PanelOperation"("businessUnitId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PanelOperation_businessUnitId_id_key" ON "PanelOperation"("businessUnitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PanelOperation_businessUnitId_movementId_key" ON "PanelOperation"("businessUnitId", "movementId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelOperation_businessUnitId_sourceRemnantId_key" ON "PanelOperation"("businessUnitId", "sourceRemnantId");

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
CREATE INDEX "Remnant_businessUnitId_productId_variantId_status_idx" ON "Remnant"("businessUnitId", "productId", "variantId", "status");

-- CreateIndex
CREATE INDEX "Remnant_businessUnitId_locationId_status_idx" ON "Remnant"("businessUnitId", "locationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Remnant_businessUnitId_code_key" ON "Remnant"("businessUnitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Remnant_businessUnitId_id_key" ON "Remnant"("businessUnitId", "id");

-- CreateIndex
CREATE INDEX "RemnantMovement_businessUnitId_remnantId_createdAt_idx" ON "RemnantMovement"("businessUnitId", "remnantId", "createdAt");

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
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_businessUnitId_movementId_fkey" FOREIGN KEY ("businessUnitId", "movementId") REFERENCES "StockMovement"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelOperation" ADD CONSTRAINT "PanelOperation_businessUnitId_sourceRemnantId_fkey" FOREIGN KEY ("businessUnitId", "sourceRemnantId") REFERENCES "Remnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_businessUnitId_variantId_fkey" FOREIGN KEY ("businessUnitId", "variantId") REFERENCES "ProductVariant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remnant" ADD CONSTRAINT "Remnant_businessUnitId_sourceOperationId_fkey" FOREIGN KEY ("businessUnitId", "sourceOperationId") REFERENCES "PanelOperation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_businessUnitId_remnantId_fkey" FOREIGN KEY ("businessUnitId", "remnantId") REFERENCES "Remnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_businessUnitId_operationId_fkey" FOREIGN KEY ("businessUnitId", "operationId") REFERENCES "PanelOperation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemnantMovement" ADD CONSTRAINT "RemnantMovement_businessUnitId_locationId_fkey" FOREIGN KEY ("businessUnitId", "locationId") REFERENCES "StockLocation"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationProfile" ("id", "name", "createdAt", "updatedAt")
VALUES ('99999999-9999-4999-8999-999999999999', 'Kumar Brothers & Associates', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "BusinessProfile" ("id", "tradeName", "unit", "businessUnitId", "invoicePrefix", "nextInvoiceNo", "currency", "createdAt", "updatedAt")
SELECT seed."id", seed."tradeName", seed."unit"::"LegacyBusinessUnit", seed."businessUnitId"::uuid, seed."invoicePrefix", 1, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('seed-profile-electricals', 'KB Electricals', 'KB_ELECTRICALS', '22222222-2222-4222-8222-222222222222', 'KBE'),
    ('seed-profile-kitchen-bath', 'KB Kitchen & Bath', 'KB_KITCHEN_BATH', '33333333-3333-4333-8333-333333333333', 'KBK'),
    ('seed-profile-tools', 'KB Tools', 'KB_TOOLS', '44444444-4444-4444-8444-444444444444', 'KBT'),
    ('seed-profile-tech', 'KB Tech', 'KB_TECH', '55555555-5555-4555-8555-555555555555', 'KBTECH'),
    ('seed-profile-interiors', 'KB Interiors', 'KB_INTERIORS', '11111111-1111-4111-8111-111111111111', 'KBI')
) AS seed("id", "tradeName", "unit", "businessUnitId", "invoicePrefix")
WHERE NOT EXISTS (
    SELECT 1 FROM "BusinessProfile" profile
    WHERE profile."businessUnitId" = seed."businessUnitId"::uuid
);

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

INSERT INTO "UserGroupRole" ("userId", "roleId")
SELECT "id", 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
FROM "User" WHERE "role" = 'ADMIN';

INSERT INTO "UserBusinessUnitRole" ("userId", "businessUnitId", "roleId")
SELECT "id", '11111111-1111-4111-8111-111111111111'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
FROM "User" WHERE "role" = 'MANAGER';

INSERT INTO "UserBusinessUnitRole" ("userId", "businessUnitId", "roleId")
SELECT "id", '11111111-1111-4111-8111-111111111111'::uuid, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
FROM "User" WHERE "role" = 'CASHIER';
