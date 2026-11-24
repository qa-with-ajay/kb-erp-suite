DROP INDEX IF EXISTS "PanelOperation_sourceRemnantId_key";
DROP INDEX IF EXISTS "PanelOperation_businessUnitId_sourceRemnantId_key";
CREATE INDEX IF NOT EXISTS "PanelOperation_businessUnitId_sourceRemnantId_createdAt_idx"
  ON "PanelOperation"("businessUnitId", "sourceRemnantId", "createdAt");
