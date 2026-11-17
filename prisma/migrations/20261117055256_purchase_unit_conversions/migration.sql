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
