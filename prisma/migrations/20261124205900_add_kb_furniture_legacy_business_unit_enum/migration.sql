-- Keep the database enum aligned with prisma/schema.prisma.
-- This must run before the KB Furniture data migration uses the new value.
ALTER TYPE "LegacyBusinessUnit"
ADD VALUE IF NOT EXISTS 'KB_FURNITURE';
