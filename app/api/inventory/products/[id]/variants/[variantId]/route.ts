import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { productVariantUpdateSchema, readJsonBody } from "@/lib/catalog-validation";

type RouteContext = { params: Promise<{ id: string; variantId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: RouteContext) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;
  const { id, variantId } = await params;
  if (!uuidPattern.test(id) || !uuidPattern.test(variantId)) return NextResponse.json({ error: "Invalid product or variant ID." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = productVariantUpdateSchema.safeParse(body.data);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Invalid variant data.", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.productVariant.findFirst({
        where: { id: variantId, productId: id, businessUnitId: businessUnit.id },
        select: { id: true },
      });
      if (!current) return null;
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...("code" in parsed.data ? { code: parsed.data.code || null } : {}),
          ...("barcode" in parsed.data ? { barcode: parsed.data.barcode || null } : {}),
          ...("attributes" in parsed.data ? { attributes: parsed.data.attributes } : {}),
          ...("isActive" in parsed.data ? { isActive: parsed.data.isActive } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "UPDATE",
          entity: "ProductVariant",
          entityId: updated.id,
          details: { productId: id, code: updated.code, isActive: updated.isActive },
        },
      });
      return updated;
    });
    if (!result) return NextResponse.json({ error: "Variant not found for this product." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Variant code or barcode is already in use." }, { status: 409 });
    }
    throw error;
  }
}
