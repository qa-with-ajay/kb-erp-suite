ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StockBalance_businessUnitId_id_key" ON "StockBalance"("businessUnitId", "id");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_stockBalance_fkey"
  FOREIGN KEY ("businessUnitId", "stockBalanceId")
  REFERENCES "StockBalance"("businessUnitId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
