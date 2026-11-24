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

ALTER TYPE "RemnantMovementType" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "RemnantMovementType" ADD VALUE IF NOT EXISTS 'RETURN_REVERSED';

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
