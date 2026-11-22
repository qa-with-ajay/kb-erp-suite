import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { parseProductList, productInputSchema, readJsonBody } from "@/lib/catalog-validation";
import { createStockMovement } from "@/lib/stock-service";

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
      include: {
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
  const parsed = productInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid product data.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const product = await prisma.$transaction(async (tx) => {
      const { openingStock, ...productFields } = parsed.data;
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
      const productId = randomUUID();
      const barcode = barcodeType === "INTERNAL"
        ? `KB${productId.replace(/-/g, "").toUpperCase()}`
        : parsed.data.barcode;
      const created = await tx.product.create({
        data: {
          id: productId,
          businessUnitId: businessUnit.id,
          ...productFields,
          barcode,
          barcodeType,
          description: parsed.data.description || null,
          categoryId: parsed.data.categoryId || null,
          brandId: parsed.data.brandId || null,
          imageUrl: parsed.data.imageUrl || null,
        },
      });
      for (const entry of openingStock) {
        const movement = await createStockMovement(tx, businessUnit.id, session.user.id, {
          type: "OPENING",
          locationId: entry.locationId,
          productId: created.id,
          quantity: entry.quantity,
          unitCost: entry.unitCost,
          reference: `PRODUCT-CREATE:${created.sku}:${entry.locationId}`,
          reason: "Opening stock recorded when product was created.",
          idempotencyKey: randomUUID(),
        });
        if (movement.kind === "error") {
          throw new Error(`OPENING_STOCK_${movement.error}`);
        }
      }
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "CREATE",
          entity: "Product",
          entityId: created.id,
          details: { name: created.name, sku: created.sku, openingStockLocations: openingStock.length },
        },
      });
      return created;
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("OPENING_STOCK_")) {
      const reason = error.message.replace("OPENING_STOCK_", "");
      const message = reason === "LOCATION_NOT_AVAILABLE"
        ? "Opening stock could not be recorded because the selected location is unavailable."
        : reason === "PRODUCT_NOT_AVAILABLE"
          ? "Opening stock could not be recorded for the new product."
          : "Opening stock could not be recorded. No product was saved; review the location and stock details.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CATEGORY_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Select an active category." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "BRAND_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Select an active brand." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU or barcode is already assigned to another product." }, { status: 409 });
    }
    throw error;
  }
}
