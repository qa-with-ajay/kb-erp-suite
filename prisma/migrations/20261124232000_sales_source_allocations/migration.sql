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
  CONSTRAINT "SaleLineStockAllocation_saleLine_fkey" FOREIGN KEY ("businessUnitId", "saleLineId") REFERENCES "SaleLine"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleLineStockAllocation_stockBalance_fkey" FOREIGN KEY ("stockBalanceId") REFERENCES "StockBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleLineStockAllocation_remnant_fkey" FOREIGN KEY ("businessUnitId", "remnantId") REFERENCES "Remnant"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SaleLineStockAllocation_source_check" CHECK (
    ("sourceType" = 'STANDARD' AND "stockBalanceId" IS NOT NULL AND "remnantId" IS NULL)
    OR ("sourceType" = 'REMNANT' AND "remnantId" IS NOT NULL AND "stockBalanceId" IS NULL)
  )
);
CREATE UNIQUE INDEX "SaleLineStockAllocation_businessUnitId_id_key" ON "SaleLineStockAllocation"("businessUnitId", "id");
CREATE INDEX "SaleLineStockAllocation_businessUnitId_saleLineId_idx" ON "SaleLineStockAllocation"("businessUnitId", "saleLineId");
CREATE INDEX "SaleLineStockAllocation_businessUnitId_sourceType_remnantId_idx" ON "SaleLineStockAllocation"("businessUnitId", "sourceType", "remnantId");
