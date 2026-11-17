ALTER TABLE "SaleLine" ADD COLUMN "lineNumber" INTEGER;

WITH numbered_lines AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "businessUnitId", "saleId" ORDER BY "id")::INTEGER AS "lineNumber"
  FROM "SaleLine"
)
UPDATE "SaleLine" line
SET "lineNumber" = numbered_lines."lineNumber"
FROM numbered_lines
WHERE line."id" = numbered_lines."id";

ALTER TABLE "SaleLine" ALTER COLUMN "lineNumber" SET NOT NULL;
CREATE UNIQUE INDEX "SaleLine_businessUnitId_saleId_lineNumber_key"
  ON "SaleLine"("businessUnitId", "saleId", "lineNumber");
