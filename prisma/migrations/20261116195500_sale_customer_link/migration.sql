ALTER TABLE "Sale" ADD COLUMN "customerId" UUID;
CREATE INDEX "Sale_businessUnitId_customerId_idx" ON "Sale"("businessUnitId", "customerId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessUnitId_customerId_fkey"
  FOREIGN KEY ("businessUnitId", "customerId") REFERENCES "Customer"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
