import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { productVariantInputSchema, readJsonBody } from "@/lib/catalog-validation";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit } = access.context;
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const product = await prisma.product.findFirst({ where: { id, businessUnitId: businessUnit.id }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const items = await prisma.productVariant.findMany({
    where: { productId: id, businessUnitId: businessUnit.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = productVariantInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid variant data.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, businessUnitId: businessUnit.id, isActive: true },
        select: { id: true },
      });
      if (!product) return null;
      const item = await tx.productVariant.create({
        data: {
          businessUnitId: businessUnit.id,
          productId: id,
          code: parsed.data.code || null,
          barcode: parsed.data.barcode || null,
          attributes: parsed.data.attributes,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "CREATE",
          entity: "ProductVariant",
          entityId: item.id,
          details: { productId: id, code: item.code, attributes: item.attributes },
        },
      });
      return item;
    });
    if (!result) return NextResponse.json({ error: "Active product not found." }, { status: 404 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Variant code or barcode is already in use." }, { status: 409 });
    }
    throw error;
  }
}
