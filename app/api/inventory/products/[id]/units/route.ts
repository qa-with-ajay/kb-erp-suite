import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { productUnitConversionSchema, readJsonBody } from "@/lib/catalog-validation";

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
    select: {
      baseUnit: true,
      unitConversions: { orderBy: { unit: "asc" } },
    },
  });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  return NextResponse.json({ baseUnit: product.baseUnit, items: product.unitConversions });
}

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = productUnitConversionSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid unit conversion.", details: parsed.error.flatten() }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id}::uuid AND "businessUnitId" = ${businessUnit.id}::uuid FOR UPDATE`;
    const product = await tx.product.findFirst({
      where: { id, businessUnitId: businessUnit.id },
      select: { baseUnit: true },
    });
    if (!product) return { error: "NOT_FOUND" as const };
    if (parsed.data.unit === product.baseUnit) return { error: "BASE_UNIT" as const };
    const saved = await tx.productUnitConversion.upsert({
      where: { productId_unit: { productId: id, unit: parsed.data.unit } },
      create: { businessUnitId: businessUnit.id, productId: id, ...parsed.data },
      update: {
        conversionFactor: parsed.data.conversionFactor,
        isPurchaseUnit: parsed.data.isPurchaseUnit,
        isSalesUnit: parsed.data.isSalesUnit,
        precision: parsed.data.precision,
        roundingMode: parsed.data.roundingMode,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        businessUnitId: businessUnit.id,
        action: "UPSERT",
        entity: "ProductUnitConversion",
        entityId: saved.id,
        details: { productId: id, unit: saved.unit, conversionFactor: saved.conversionFactor.toString() },
      },
    });
    return { item: saved };
  });
  if ("error" in result) {
    if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (result.error === "BASE_UNIT") return NextResponse.json({ error: "The base unit is fixed at a conversion factor of 1 and cannot be configured again." }, { status: 400 });
  }
  return NextResponse.json(result.item);
}
