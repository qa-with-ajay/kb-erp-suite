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

CREATE INDEX "SaleReturnLine_businessUnitId_sourceAllocationId_idx"
  ON "SaleReturnLine"("businessUnitId", "sourceAllocationId");
