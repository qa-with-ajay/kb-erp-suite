CREATE UNIQUE INDEX "StockBalance_businessUnitId_id_key" ON "StockBalance"("businessUnitId", "id");
ALTER TABLE "SaleLineStockAllocation"
  ADD CONSTRAINT "SaleLineStockAllocation_stockBalance_fkey"
  FOREIGN KEY ("businessUnitId", "stockBalanceId")
  REFERENCES "StockBalance"("businessUnitId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
