CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_businessUnitId_id_key" ON "Customer"("businessUnitId", "id");
CREATE INDEX "Customer_businessUnitId_isActive_name_idx" ON "Customer"("businessUnitId", "isActive", "name");
CREATE INDEX "Customer_businessUnitId_phone_idx" ON "Customer"("businessUnitId", "phone");
CREATE UNIQUE INDEX "Supplier_businessUnitId_id_key" ON "Supplier"("businessUnitId", "id");
CREATE INDEX "Supplier_businessUnitId_isActive_name_idx" ON "Supplier"("businessUnitId", "isActive", "name");
CREATE INDEX "Supplier_businessUnitId_phone_idx" ON "Supplier"("businessUnitId", "phone");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
