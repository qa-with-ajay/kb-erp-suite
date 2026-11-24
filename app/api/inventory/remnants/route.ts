import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";

const createSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid(),
  inputQuantity: z.coerce.number().positive().max(100000000),
  remnantQuantity: z.coerce.number().min(0).max(100000000),
  inputLength: z.coerce.number().positive().optional(),
  inputWidth: z.coerce.number().positive().optional(),
  remnantLength: z.coerce.number().positive().optional(),
  remnantWidth: z.coerce.number().positive().optional(),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
}).refine((value) => value.remnantQuantity <= value.inputQuantity, {
  path: ["remnantQuantity"], message: "Reusable remnant quantity cannot exceed the consumed quantity.",
}).refine((value) => (value.inputLength === undefined) === (value.inputWidth === undefined), {
  path: ["inputLength"], message: "Provide both input dimensions or neither.",
}).refine((value) => (value.remnantLength === undefined) === (value.remnantWidth === undefined), {
  path: ["remnantLength"], message: "Provide both remnant dimensions or neither.",
});

export async function GET(request: Request) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const locationId = params.get("locationId");
  const productId = params.get("productId");
  const items = await prisma.materialRemnant.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      ...(status && ["AVAILABLE", "SOLD", "CONSUMED", "WASTED", "ADJUSTED"].includes(status)
        ? { status: status as "AVAILABLE" | "SOLD" | "CONSUMED" | "WASTED" | "ADJUSTED" } : {}),
      ...(locationId ? { locationId } : {}),
      ...(productId ? { productId } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true, baseUnit: true, productType: true } },
      variant: { select: { id: true, code: true, attributes: true } },
      location: { select: { id: true, name: true, code: true } },
      sourceOperation: { select: { id: true, type: true, inputQuantity: true, inputUnit: true, createdAt: true } },
      movements: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, quantityDelta: true, reason: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit, session } = access.context;
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid material processing entry.", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.stockMovement.findFirst({
        where: { businessUnitId: businessUnit.id, idempotencyKey: input.idempotencyKey },
        include: { materialProcessing: { include: { outputRemnants: true } } },
      });
      if (prior?.materialProcessing) return { replayed: true, processing: prior.materialProcessing };
      if (prior) return { error: "IDEMPOTENCY_CONFLICT" as const };

      const locations = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockLocation"
        WHERE "id" = ${input.locationId}::uuid AND "businessUnitId" = ${businessUnit.id}::uuid AND "isActive" = true
        FOR UPDATE
      `;
      if (!locations.length) return { error: "LOCATION_NOT_AVAILABLE" as const };

      const product = await tx.product.findFirst({
        where: { id: input.productId, businessUnitId: businessUnit.id, isActive: true, productType: "MATERIAL", isProcessingEnabled: true },
        select: { id: true, baseUnit: true, variants: { where: { isActive: true }, select: { id: true }, take: 1 } },
      });
      if (!product) return { error: "PROCESSING_NOT_ENABLED" as const };
      if (product.variants.length && !input.variantId) return { error: "VARIANT_REQUIRED" as const };
      if (input.variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, productId: product.id, businessUnitId: businessUnit.id, isActive: true }, select: { id: true } });
        if (!variant) return { error: "VARIANT_NOT_AVAILABLE" as const };
      }

      const balanceWhere = { businessUnitId: businessUnit.id, locationId: input.locationId, productId: product.id, variantId: input.variantId ?? null, stockKind: "STANDARD" as const };
      const sourceBalance = await tx.stockBalance.findFirst({ where: balanceWhere });
      const inputQty = new Prisma.Decimal(input.inputQuantity);
      const remnantQty = new Prisma.Decimal(input.remnantQuantity);
      const currentQty = sourceBalance?.quantity ?? new Prisma.Decimal(0);
      if (currentQty.lt(inputQty)) return { error: "INSUFFICIENT_STOCK" as const };
      const unitCost = sourceBalance?.averageCost ?? new Prisma.Decimal(0);

      const movement = await tx.stockMovement.create({
        data: {
          businessUnitId: businessUnit.id, actorId: session.user.id, type: "MATERIAL_PROCESSING",
          sourceLocationId: input.locationId, destinationLocationId: input.locationId,
          reference: input.reference || null, idempotencyKey: input.idempotencyKey,
          reason: input.reason || "Material processed; reusable leftover recorded.",
        },
      });
      const processing = await tx.materialProcessing.create({
        data: {
          businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
          variantId: input.variantId ?? null, type: "CUT",
          inputLength: input.inputLength ? new Prisma.Decimal(input.inputLength) : null,
          inputWidth: input.inputWidth ? new Prisma.Decimal(input.inputWidth) : null,
          inputQuantity: inputQty, inputUnit: product.baseUnit,
          wastedQuantity: inputQty.minus(remnantQty),
          wastedArea: new Prisma.Decimal(0),
        },
      });
      const ledgerRows: Prisma.StockLedgerEntryCreateManyInput[] = [{
        businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
        variantId: input.variantId ?? null, locationId: input.locationId, stockKind: "STANDARD" as const,
        quantityDelta: inputQty.negated(), unitCost,
      }];
      if (remnantQty.isPositive()) ledgerRows.push({
        businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
        variantId: input.variantId ?? null, locationId: input.locationId, stockKind: "REMNANT" as const,
        quantityDelta: remnantQty, unitCost,
      });
      await tx.stockLedgerEntry.createMany({ data: ledgerRows });
      await tx.stockBalance.update({
        where: { id: sourceBalance!.id },
        data: { quantity: currentQty.minus(inputQty) },
      });

      let remnant = null;
      if (remnantQty.isPositive()) {
        const remnantWhere = { businessUnitId: businessUnit.id, locationId: input.locationId, productId: product.id, variantId: input.variantId ?? null, stockKind: "REMNANT" as const };
        const remnantBalance = await tx.stockBalance.findFirst({ where: remnantWhere });
        const remnantCurrent = remnantBalance?.quantity ?? new Prisma.Decimal(0);
        const remnantNext = remnantCurrent.plus(remnantQty);
        const remnantAverage = remnantBalance && remnantNext.isPositive()
          ? remnantCurrent.mul(remnantBalance.averageCost).plus(remnantQty.mul(unitCost)).div(remnantNext).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : unitCost;
        if (remnantBalance) await tx.stockBalance.update({ where: { id: remnantBalance.id }, data: { quantity: remnantNext, averageCost: remnantAverage } });
        else await tx.stockBalance.create({ data: { ...remnantWhere, quantity: remnantNext, averageCost: remnantAverage } });
        remnant = await tx.materialRemnant.create({
          data: {
            businessUnitId: businessUnit.id, code: `MR-${randomUUID().slice(0, 8).toUpperCase()}`,
            productId: product.id, variantId: input.variantId ?? null, locationId: input.locationId,
            sourceOperationId: processing.id, quantity: remnantQty, unit: product.baseUnit,
            length: input.remnantLength ? new Prisma.Decimal(input.remnantLength) : null,
            width: input.remnantWidth ? new Prisma.Decimal(input.remnantWidth) : null,
          },
        });
        await tx.materialRemnantMovement.create({
          data: { businessUnitId: businessUnit.id, remnantId: remnant.id, operationId: processing.id,
            locationId: input.locationId, actorId: session.user.id, type: "CREATED", quantityDelta: remnantQty,
            reason: input.reason || "Created from material processing." },
        });
      }
      await tx.auditLog.create({
        data: { userId: session.user.id, businessUnitId: businessUnit.id, action: "CREATE",
          entity: "MaterialProcessing", entityId: processing.id,
          details: { productId: product.id, inputQuantity: inputQty.toString(), remnantQuantity: remnantQty.toString(), unit: product.baseUnit } },
      });
      return { processing, remnant, replayed: false };
    });
    if ("error" in result) {
      const errors: Record<string, { message: string; status: number }> = {
        IDEMPOTENCY_CONFLICT: { message: "This request key has already been used.", status: 409 },
        LOCATION_NOT_AVAILABLE: { message: "Select an active stock location.", status: 400 },
        PROCESSING_NOT_ENABLED: { message: "Enable material processing on this MATERIAL product first.", status: 400 },
        VARIANT_REQUIRED: { message: "Select a product variant.", status: 400 },
        VARIANT_NOT_AVAILABLE: { message: "Select a valid active variant.", status: 400 },
        INSUFFICIENT_STOCK: { message: "There is not enough standard stock at this location.", status: 409 },
      };
      return NextResponse.json({ error: errors[result.error].message }, { status: errors[result.error].status });
    }
    return NextResponse.json({ ...result, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Duplicate request or remnant code. Retry the operation." }, { status: 409 });
    throw error;
  }
}
