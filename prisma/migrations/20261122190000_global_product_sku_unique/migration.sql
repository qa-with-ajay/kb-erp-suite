-- Product SKUs are group-wide identifiers, not business-unit-local identifiers.
-- Detect case-insensitive collisions before normalizing existing data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" GROUP BY upper("sku") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Cannot enforce global SKU uniqueness: duplicate product SKUs exist across business units. Resolve duplicates and rerun this migration.';
  END IF;
END $$;

UPDATE "Product" SET "sku" = upper("sku") WHERE "sku" <> upper("sku");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
