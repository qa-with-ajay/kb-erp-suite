ALTER TABLE "Product"
ADD COLUMN "materialUnit" "MeasurementUnit",
ADD COLUMN "materialUnitsPerBaseUnit" DECIMAL(18,8);

ALTER TABLE "Product"
ADD CONSTRAINT "Product_material_unit_factor_pair_check"
CHECK (("materialUnit" IS NULL AND "materialUnitsPerBaseUnit" IS NULL)
  OR ("materialUnit" IS NOT NULL AND "materialUnitsPerBaseUnit" IS NOT NULL AND "materialUnitsPerBaseUnit" > 0 AND "materialUnit" <> "baseUnit"));
