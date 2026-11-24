CREATE INDEX "SaleLineStockAllocation_businessUnitId_stockBalanceId_idx"
  ON "SaleLineStockAllocation"("businessUnitId", "stockBalanceId");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_positive_quantities_check"
  CHECK ("quantity" > 0 AND "conversionFactor" > 0 AND "baseQuantity" > 0);
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_nonnegative_costs_check"
  CHECK ("unitCost" >= 0 AND "lineCost" >= 0);
