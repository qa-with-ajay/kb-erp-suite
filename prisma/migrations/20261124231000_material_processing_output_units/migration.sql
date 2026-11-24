ALTER TABLE "PanelOperation"
  ADD COLUMN "consumedQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "outputUnit" "MeasurementUnit";

ALTER TABLE "Remnant"
  ADD COLUMN "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0;
