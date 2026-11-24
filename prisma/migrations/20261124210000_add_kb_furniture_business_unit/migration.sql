-- Add KB Furniture as a first-class business unit.
-- The enum value already exists in LegacyBusinessUnit; no schema change is needed.

INSERT INTO "BusinessUnit" (
  "id",
  "code",
  "name",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  '66666666-6666-4666-8666-666666666666'::uuid,
  'KB_FURNITURE',
  'KB Furniture',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- Create the unit profile only when one does not already exist.
INSERT INTO "BusinessProfile" (
  "id",
  "tradeName",
  "unit",
  "invoicePrefix",
  "nextInvoiceNo",
  "currency",
  "createdAt",
  "updatedAt",
  "businessUnitId"
)
SELECT
  'kb-furniture-profile',
  'KB Furniture',
  'KB_FURNITURE'::"LegacyBusinessUnit",
  'KBF',
  1,
  'INR',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  bu."id"
FROM "BusinessUnit" bu
WHERE bu."code" = 'KB_FURNITURE'
ON CONFLICT ("businessUnitId") DO NOTHING;

-- Each unit needs an operational stock location.
INSERT INTO "StockLocation" (
  "id",
  "name",
  "code",
  "isActive",
  "createdAt",
  "updatedAt",
  "businessUnitId"
)
SELECT
  '66666666-6666-4666-8666-666666666667'::uuid,
  'Main Store',
  'MAIN',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  bu."id"
FROM "BusinessUnit" bu
WHERE bu."code" = 'KB_FURNITURE'
ON CONFLICT ("businessUnitId", "code") DO NOTHING;
