import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { parseProductList, productInputSchema, readJsonBody } from "@/lib/catalog-validation";
import { createStockMovement } from "@/lib/stock-service";
import { productStockEntrySchema } from "@/lib/stock-validation";
import { generateProductSku } from "@/lib/sku";

export async function GET(request: Request) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit } = access.context;

  const parsedParams = parseProductList(new URL(request.url).searchParams);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid product filters." }, { status: 400 });
  const params = parsedParams.data;
  const where: Prisma.ProductWhereInput = {
    businessUnitId: businessUnit.id,
    ...(params.search ? {
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { sku: { contains: params.search, mode: "insensitive" } },
        { barcode: { contains: params.search, mode: "insensitive" } },
      ],
    } : {}),
    ...(params.active === "all" ? {} : { isActive: params.active === "true" }),
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.brandId ? { brandId: params.brandId } : {}),
    ...(params.productType ? { productType: params.productType } : {}),
  };
  let orderBy: Prisma.ProductOrderByWithRelationInput = { name: "asc" };
  if (params.sort === "nameDesc") orderBy = { name: "desc" };
  if (params.sort === "skuAsc") orderBy = { sku: "asc" };
  if (params.sort === "priceAsc") orderBy = { sellingPrice: "asc" };
  if (params.sort === "priceDesc") orderBy = { sellingPrice: "desc" };
  if (params.sort === "newest") orderBy = { createdAt: "desc" };
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        productType: true,
        isProcessingEnabled: true,
        baseUnit: true,
        sellingPrice: true,
        gstPercentage: true,
        minimumStock: true,
        barcode: true,
        barcodeType: true,
        imageUrl: true,
        isActive: true,
        categoryId: true,
        brandId: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        _count: { select: { variants: true } },
      },
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;

  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const raw = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {};
  const requestId = raw.requestId === undefined ? null : typeof raw.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.requestId) ? raw.requestId : undefined;
  if (requestId === undefined) return NextResponse.json({ error: "Invalid product creation request ID." }, { status: 400 });
  const stockEntryParsed = raw.stockEntry == null ? null : productStockEntrySchema.safeParse(raw.stockEntry);
  if (stockEntryParsed && !stockEntryParsed.success) return NextResponse.json({ error: "Invalid stock entry.", details: stockEntryParsed.error.flatten() }, { status: 400 });
  if (requestId && stockEntryParsed?.success && stockEntryParsed.data.idempotencyKey !== requestId) {
    return NextResponse.json({ error: "Product and initial stock request IDs must match." }, { status: 400 });
  }
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid product data.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const product = await prisma.$transaction(async (tx) => {
      if (requestId) {
        const existing = await tx.product.findFirst({ where: { id: requestId, businessUnitId: businessUnit.id } });
        if (existing) return existing;
      }
      const productFields = parsed.data;
      const sku = parsed.data.sku?.trim().toUpperCase() || await generateProductSku(tx, businessUnit.id, parsed.data.categoryId || null);
      if (parsed.data.categoryId) {
        const category = await tx.category.findFirst({
          where: { id: parsed.data.categoryId, businessUnitId: businessUnit.id, isActive: true },
          select: { id: true },
        });
        if (!category) throw new Error("CATEGORY_NOT_AVAILABLE");
      }
      if (parsed.data.brandId) {
        const brand = await tx.brand.findFirst({
          where: { id: parsed.data.brandId, businessUnitId: businessUnit.id, isActive: true },
          select: { id: true },
        });
        if (!brand) throw new Error("BRAND_NOT_AVAILABLE");
      }
      const barcodeType = parsed.data.barcodeType ?? (parsed.data.barcode ? "MANUFACTURER" : "INTERNAL");
      const productId = requestId ?? randomUUID();
      const barcode = barcodeType === "INTERNAL"
        ? `KB${productId.replace(/-/g, "").toUpperCase()}`
        : parsed.data.barcode;
      const created = await tx.product.create({
        data: {
          id: productId,
          businessUnitId: businessUnit.id,
          ...productFields,
          sku,
          purchasePrice: new Prisma.Decimal(0),
          barcode,
          barcodeType,
          description: parsed.data.description || null,
          categoryId: parsed.data.categoryId || null,
          brandId: parsed.data.brandId || null,
          imageUrl: parsed.data.imageUrl || null,
        },
      });
      if (stockEntryParsed?.success) {
        const inward = await createStockMovement(tx, businessUnit.id, session.user.id, {
          type: "INWARD", productId: created.id, variantId: stockEntryParsed.data.variantId || null, locationId: stockEntryParsed.data.locationId,
          quantity: stockEntryParsed.data.quantity, unitCost: stockEntryParsed.data.unitCost,
          reference: stockEntryParsed.data.reference || null,
          reason: "Initial stock inward recorded from product form.",
          idempotencyKey: stockEntryParsed.data.idempotencyKey,
        });
        if (inward.kind === "error") throw new Error("STOCK_INWARD_" + inward.error);
      }
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "CREATE",
          entity: "Product",
          entityId: created.id,
          details: { name: created.name, sku: created.sku },
        },
      });
      return created;
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STOCK_INWARD_")) return NextResponse.json({ error: "Product could not be saved because stock inward failed: " + error.message.slice(13).replaceAll("_", " ").toLowerCase() }, { status: 400 });
    if (error instanceof Error && error.message === "CATEGORY_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Select an active category." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "BRAND_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Select an active brand." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (requestId) {
        const existing = await prisma.product.findFirst({ where: { id: requestId, businessUnitId: businessUnit.id } });
        if (existing) return NextResponse.json(existing, { status: 200 });
      }
      return NextResponse.json({ error: "SKU or barcode is already assigned to another product." }, { status: 409 });
    }
    throw error;
  }
}
