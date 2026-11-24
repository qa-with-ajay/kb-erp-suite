-- Add KB_FURNITURE to the legacy business-unit enum before the
-- KB Furniture BusinessUnit / BusinessProfile seed migration runs.
ALTER TYPE "LegacyBusinessUnit"
ADD VALUE IF NOT EXISTS 'KB_FURNITURE';
