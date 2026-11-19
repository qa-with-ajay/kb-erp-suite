import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { productUpdateSchema, readJsonBody } from "@/lib/catalog-validation";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit } = access.context;
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { id, businessUnitId: businessUnit.id },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      variants: { orderBy: { createdAt: "asc" } },
      unitConversions: { orderBy: { unit: "asc" } },
    },
  });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;

  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = productUpdateSchema.safeParse(body.data);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Invalid product data.", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id}::uuid AND "businessUnitId" = ${businessUnit.id}::uuid FOR UPDATE`;
      const current = await tx.product.findFirst({ where: { id, businessUnitId: businessUnit.id } });
      if (!current) return { error: "NOT_FOUND" as const };
      const nextBaseUnit = parsed.data.baseUnit ?? current.baseUnit;
      const nextProductType = parsed.data.productType ?? current.productType;
      if (nextProductType === "PANEL" && nextBaseUnit !== "SQFT") return { error: "PANEL_BASE_UNIT" as const };

      if (nextBaseUnit !== current.baseUnit) {
        const [ledgerCount, conversionCount] = await Promise.all([
          tx.stockLedgerEntry.count({ where: { businessUnitId: businessUnit.id, productId: id } }),
          tx.productUnitConversion.count({ where: { businessUnitId: businessUnit.id, productId: id } }),
        ]);
        if (ledgerCount > 0 || conversionCount > 0) return { error: "BASE_UNIT_IN_USE" as const };
      }
      if (parsed.data.categoryId) {
        const category = await tx.category.findFirst({
          where: { id: parsed.data.categoryId, businessUnitId: businessUnit.id, isActive: true },
          select: { id: true },
        });
        if (!category) return { error: "CATEGORY_NOT_AVAILABLE" as const };
      }
      if (parsed.data.brandId) {
        const brand = await tx.brand.findFirst({
          where: { id: parsed.data.brandId, businessUnitId: businessUnit.id, isActive: true },
          select: { id: true },
        });
        if (!brand) return { error: "BRAND_NOT_AVAILABLE" as const };
      }

      const nextBarcodeType = parsed.data.barcodeType ?? current.barcodeType;
      if (nextBarcodeType === "MANUFACTURER" && !(parsed.data.barcode ?? current.barcode)) {
        return { error: "MANUFACTURER_BARCODE_REQUIRED" as const };
      }
      const shouldGenerateBarcode = nextBarcodeType === "INTERNAL" &&
        (current.barcodeType !== "INTERNAL" || !current.barcode);
      const generatedBarcode = shouldGenerateBarcode
        ? `KB${randomUUID().replace(/-/g, "").toUpperCase()}`
        : null;
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...parsed.data,
          barcodeType: nextBarcodeType,
          barcode: nextBarcodeType === "INTERNAL" ? (generatedBarcode ?? current.barcode) : (parsed.data.barcode ?? current.barcode),
          ...("description" in parsed.data ? { description: parsed.data.description || null } : {}),
          ...("categoryId" in parsed.data ? { categoryId: parsed.data.categoryId || null } : {}),
          ...("brandId" in parsed.data ? { brandId: parsed.data.brandId || null } : {}),
          ...("imageUrl" in parsed.data ? { imageUrl: parsed.data.imageUrl || null } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "UPDATE",
          entity: "Product",
          entityId: updated.id,
          details: { name: updated.name, sku: updated.sku, isActive: updated.isActive },
        },
      });
      return { product: updated };
    });

    if ("error" in result) {
      if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Product not found." }, { status: 404 });
      if (result.error === "MANUFACTURER_BARCODE_REQUIRED") return NextResponse.json({ error: "Enter or scan the manufacturer barcode." }, { status: 400 });
      if (result.error === "PANEL_BASE_UNIT") return NextResponse.json({ error: "Panel products must use SQFT as their base unit." }, { status: 400 });
      if (result.error === "BASE_UNIT_IN_USE") return NextResponse.json({ error: "Base unit cannot change after conversions or stock ledger entries exist." }, { status: 409 });
      if (result.error === "CATEGORY_NOT_AVAILABLE") return NextResponse.json({ error: "Select an active category." }, { status: 400 });
      if (result.error === "BRAND_NOT_AVAILABLE") return NextResponse.json({ error: "Select an active brand." }, { status: 400 });
    }
    return NextResponse.json(result.product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU or barcode is already assigned to another product." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    throw error;
  }
}
