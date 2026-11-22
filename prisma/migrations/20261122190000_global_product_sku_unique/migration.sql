-- Product SKUs are group-wide identifiers, not business-unit-local identifiers.
-- Normalize existing values, then fail clearly if legacy data contains collisions.
UPDATE "Product" SET "sku" = upper("sku") WHERE "sku" <> upper("sku");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" GROUP BY "sku" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Cannot enforce global SKU uniqueness: duplicate product SKUs exist across business units. Resolve duplicates and rerun this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
