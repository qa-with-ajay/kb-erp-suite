import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";

const outputSchema = z.object({
  quantity: z.coerce.number().positive().max(100000000),
  length: z.coerce.number().positive().optional(),
  width: z.coerce.number().positive().optional(),
}).refine((value) => (value.length === undefined) === (value.width === undefined), {
  path: ["length"], message: "Provide both output dimensions or neither.",
});
const createSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid(),
  sourceType: z.enum(["STANDARD", "REMNANT"]).default("STANDARD"),
  sourceRemnantId: z.string().uuid().optional(),
  inputQuantity: z.coerce.number().positive().max(100000000),
  consumedQuantity: z.coerce.number().min(0).max(100000000).default(0),
  outputs: z.array(outputSchema).max(20).default([]),
  inputLength: z.coerce.number().positive().optional(),
  inputWidth: z.coerce.number().positive().optional(),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
}).refine((value) => (value.inputLength === undefined) === (value.inputWidth === undefined), {
  path: ["inputLength"], message: "Provide both input dimensions or neither.",
}).refine((value) => value.sourceType !== "REMNANT" || Boolean(value.sourceRemnantId), {
  path: ["sourceRemnantId"], message: "Select the remnant being processed.",
}).refine((value) => value.sourceType !== "STANDARD" || !value.sourceRemnantId, {
  path: ["sourceRemnantId"], message: "A source remnant is only valid for remnant processing.",
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
      product: { select: { id: true, name: true, sku: true, baseUnit: true, materialUnit: true, materialUnitsPerBaseUnit: true, productType: true } },
      variant: { select: { id: true, code: true, attributes: true } },
      location: { select: { id: true, name: true, code: true } },
      sourceOperation: { select: { id: true, type: true, inputQuantity: true, inputUnit: true, createdAt: true } },
      usedAsSource: { select: { id: true, type: true, createdAt: true } },
      movements: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, quantityDelta: true, reason: true, createdAt: true } },
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
      if (prior?.materialProcessing) return { replayed: true, processing: prior.materialProcessing, outputs: prior.materialProcessing.outputRemnants };
      if (prior) return { error: "IDEMPOTENCY_CONFLICT" as const };

      const locations = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockLocation"
        WHERE "id" = ${input.locationId}::uuid AND "businessUnitId" = ${businessUnit.id}::uuid AND "isActive" = true
        FOR UPDATE
      `;
      if (!locations.length) return { error: "LOCATION_NOT_AVAILABLE" as const };

      const product = await tx.product.findFirst({
        where: { id: input.productId, businessUnitId: businessUnit.id, isActive: true, productType: "MATERIAL", isProcessingEnabled: true },
        select: { id: true, baseUnit: true, materialUnit: true, materialUnitsPerBaseUnit: true, variants: { where: { isActive: true }, select: { id: true }, take: 1 } },
      });
      if (!product) return { error: "PROCESSING_NOT_ENABLED" as const };
      if (product.variants.length && !input.variantId) return { error: "VARIANT_REQUIRED" as const };
      if (input.variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, productId: product.id, businessUnitId: businessUnit.id, isActive: true }, select: { id: true } });
        if (!variant) return { error: "VARIANT_NOT_AVAILABLE" as const };
      }
      const outputUnit = product.materialUnit ?? product.baseUnit;
      const factor = product.materialUnitsPerBaseUnit ?? new Prisma.Decimal(1);
      const standardWhere = { businessUnitId: businessUnit.id, locationId: input.locationId, productId: product.id, variantId: input.variantId ?? null, stockKind: "STANDARD" as const };
      const remnantWhere = { ...standardWhere, stockKind: "REMNANT" as const };
      let sourceRemnant: { id: string; quantity: Prisma.Decimal; unit: typeof outputUnit | null; unitCost: Prisma.Decimal; length: Prisma.Decimal | null; width: Prisma.Decimal | null } | null = null;
      let sourceBalance: { id: string; quantity: Prisma.Decimal; averageCost: Prisma.Decimal } | null = null;
      const requestedInput = new Prisma.Decimal(input.inputQuantity);
      let inputMaterialQty: Prisma.Decimal;
      let materialUnitCost: Prisma.Decimal;

      if (input.sourceType === "STANDARD") {
        if (product.materialUnit && !requestedInput.isInteger()) return { error: "INVALID_INPUT_QUANTITY" as const };
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "StockBalance" WHERE "businessUnitId" = ${businessUnit.id}::uuid
          AND "locationId" = ${input.locationId}::uuid AND "productId" = ${product.id}::uuid
          AND "variantId" IS NOT DISTINCT FROM ${input.variantId ?? null}::uuid AND "stockKind" = 'STANDARD'
          FOR UPDATE
        `;
        if (!locked.length) return { error: "INSUFFICIENT_STOCK" as const };
        sourceBalance = await tx.stockBalance.findFirst({ where: { ...standardWhere, id: locked[0].id } });
        if (!sourceBalance || sourceBalance.quantity.lt(requestedInput)) return { error: "INSUFFICIENT_STOCK" as const };
        inputMaterialQty = requestedInput.mul(factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        materialUnitCost = sourceBalance.averageCost.div(factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      } else {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Remnant" WHERE "id" = ${input.sourceRemnantId!}::uuid
          AND "businessUnitId" = ${businessUnit.id}::uuid AND "productId" = ${product.id}::uuid
          AND "locationId" = ${input.locationId}::uuid AND "status" = 'AVAILABLE'
          FOR UPDATE
        `;
        if (!locked.length) return { error: "SOURCE_REMNANT_NOT_AVAILABLE" as const };
        sourceRemnant = await tx.materialRemnant.findFirst({ where: { id: locked[0].id, businessUnitId: businessUnit.id } });
        if (!sourceRemnant || sourceRemnant.variantId !== (input.variantId ?? null) || sourceRemnant.unit !== outputUnit || sourceRemnant.quantity.lt(requestedInput)) {
          return { error: "SOURCE_REMNANT_NOT_AVAILABLE" as const };
        }
        inputMaterialQty = requestedInput;
        materialUnitCost = sourceRemnant.unitCost;
      }

      const consumedQty = new Prisma.Decimal(input.consumedQuantity);
      const outputTotal = input.outputs.reduce((sum, output) => sum.plus(new Prisma.Decimal(output.quantity)), new Prisma.Decimal(0));
      if (consumedQty.plus(outputTotal).gt(inputMaterialQty)) return { error: "OUTPUT_QUANTITY_EXCEEDED" as const };
      if (consumedQty.isZero() && outputTotal.isZero()) return { error: "NO_PROCESSING_OUTPUT" as const };
      const wastedQty = inputMaterialQty.minus(consumedQty).minus(outputTotal);
      const totalCost = inputMaterialQty.mul(materialUnitCost);
      const outputCount = input.outputs.length;
      const movement = await tx.stockMovement.create({
        data: {
          businessUnitId: businessUnit.id, actorId: session.user.id, type: "MATERIAL_PROCESSING",
          sourceLocationId: input.locationId, destinationLocationId: input.locationId,
          reference: input.reference || null, idempotencyKey: input.idempotencyKey,
          reason: input.reason || "Material processed; consumed, reusable outputs and waste recorded.",
        },
      });
      const processing = await tx.materialProcessing.create({
        data: {
          businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
          variantId: input.variantId ?? null, sourceRemnantId: sourceRemnant?.id ?? null, type: "CUT",
          inputLength: input.inputLength ? new Prisma.Decimal(input.inputLength) : sourceRemnant?.length ?? null,
          inputWidth: input.inputWidth ? new Prisma.Decimal(input.inputWidth) : sourceRemnant?.width ?? null,
          inputQuantity: requestedInput,
          inputUnit: input.sourceType === "STANDARD" ? product.baseUnit : outputUnit,
          consumedQuantity: consumedQty, outputUnit, wastedQuantity: wastedQty,
          wastedArea: new Prisma.Decimal(0),
        },
      });

      const ledgerRows: Prisma.StockLedgerEntryCreateManyInput[] = [];
      if (sourceBalance) {
        ledgerRows.push({ businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
          variantId: input.variantId ?? null, locationId: input.locationId, stockKind: "STANDARD",
          quantityDelta: requestedInput.negated(), unitCost: sourceBalance.averageCost });
        const changed = await tx.stockBalance.updateMany({
          where: { id: sourceBalance.id, businessUnitId: businessUnit.id, quantity: { gte: requestedInput } },
          data: { quantity: { decrement: requestedInput } },
        });
        if (changed.count !== 1) throw new Error("MATERIAL_SOURCE_STOCK_CHANGED");
      } else if (sourceRemnant) {
        const lockedBalance = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "StockBalance" WHERE "businessUnitId" = ${businessUnit.id}::uuid
          AND "locationId" = ${input.locationId}::uuid AND "productId" = ${product.id}::uuid
          AND "variantId" IS NOT DISTINCT FROM ${input.variantId ?? null}::uuid AND "stockKind" = 'REMNANT'
          FOR UPDATE
        `;
        if (!lockedBalance.length) return { error: "STOCK_BALANCE_MISMATCH" as const };
        const balance = await tx.stockBalance.findFirst({ where: { ...remnantWhere, id: lockedBalance[0].id } });
        if (!balance || balance.quantity.lt(requestedInput)) return { error: "STOCK_BALANCE_MISMATCH" as const };
        const changed = await tx.stockBalance.updateMany({
          where: { id: balance.id, businessUnitId: businessUnit.id, quantity: { gte: requestedInput } },
          data: { quantity: { decrement: requestedInput } },
        });
        if (changed.count !== 1) throw new Error("MATERIAL_SOURCE_STOCK_CHANGED");
        await tx.materialRemnant.update({ where: { id: sourceRemnant.id }, data: {
          quantity: { decrement: requestedInput },
          ...(sourceRemnant.quantity.equals(requestedInput) ? { status: "CONSUMED" } : {}),
        } });
        await tx.materialRemnantMovement.create({
          data: { businessUnitId: businessUnit.id, remnantId: sourceRemnant.id, operationId: processing.id,
            locationId: input.locationId, actorId: session.user.id, type: "CONSUMED",
            quantityDelta: requestedInput.negated(), reason: input.reason || "Used as input for further material processing." },
        });
        ledgerRows.push({ businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
          variantId: input.variantId ?? null, locationId: input.locationId, stockKind: "REMNANT",
          quantityDelta: requestedInput.negated(), unitCost: materialUnitCost });
      }

      const createdRemnants = [];
      for (const output of input.outputs) {
        const outputQty = new Prisma.Decimal(output.quantity);
        const remnant = await tx.materialRemnant.create({
          data: {
            businessUnitId: businessUnit.id, code: `MR-${randomUUID().slice(0, 8).toUpperCase()}`,
            productId: product.id, variantId: input.variantId ?? null, locationId: input.locationId,
            sourceOperationId: processing.id, quantity: outputQty, unit: outputUnit,
            unitCost: materialUnitCost,
            length: output.length ? new Prisma.Decimal(output.length) : null,
            width: output.width ? new Prisma.Decimal(output.width) : null,
          },
        });
        createdRemnants.push(remnant);
        await tx.materialRemnantMovement.create({
          data: { businessUnitId: businessUnit.id, remnantId: remnant.id, operationId: processing.id,
            locationId: input.locationId, actorId: session.user.id, type: "CREATED",
            quantityDelta: outputQty, reason: input.reason || `Created as output ${createdRemnants.length} from material processing.` },
        });
        ledgerRows.push({ businessUnitId: businessUnit.id, movementId: movement.id, productId: product.id,
          variantId: input.variantId ?? null, locationId: input.locationId, stockKind: "REMNANT",
          quantityDelta: outputQty, unitCost: materialUnitCost });
      }
      if (ledgerRows.length) await tx.stockLedgerEntry.createMany({ data: ledgerRows });

      if (createdRemnants.length) {
        const existing = await tx.stockBalance.findFirst({ where: remnantWhere });
        const currentQty = existing?.quantity ?? new Prisma.Decimal(0);
        const nextQty = currentQty.plus(outputTotal);
        const average = existing && nextQty.isPositive()
          ? currentQty.mul(existing.averageCost).plus(outputTotal.mul(materialUnitCost)).div(nextQty).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : materialUnitCost;
        if (existing) await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: nextQty, averageCost: average } });
        else await tx.stockBalance.create({ data: { ...remnantWhere, quantity: outputTotal, averageCost: average } });
      }
      await tx.auditLog.create({
        data: { userId: session.user.id, businessUnitId: businessUnit.id, action: "CREATE",
          entity: "MaterialProcessing", entityId: processing.id,
          details: { productId: product.id, sourceType: input.sourceType, sourceRemnantId: sourceRemnant?.id ?? null,
            inputQuantity: requestedInput.toString(), inputUnit: input.sourceType === "STANDARD" ? product.baseUnit : outputUnit,
            consumedQuantity: consumedQty.toString(), outputCount, outputQuantity: outputTotal.toString(),
            wastedQuantity: wastedQty.toString(), outputUnit, unitCost: materialUnitCost.toString(), totalInputCost: totalCost.toString() } },
      });
      return { processing, outputs: createdRemnants, replayed: false };
    });
    if ("error" in result) {
      const errors: Record<string, { message: string; status: number }> = {
        IDEMPOTENCY_CONFLICT: { message: "This request key has already been used.", status: 409 },
        LOCATION_NOT_AVAILABLE: { message: "Select an active stock location.", status: 400 },
        PROCESSING_NOT_ENABLED: { message: "Enable material processing on this MATERIAL product first.", status: 400 },
        VARIANT_REQUIRED: { message: "Select a product variant.", status: 400 },
        VARIANT_NOT_AVAILABLE: { message: "Select a valid active variant.", status: 400 },
        INSUFFICIENT_STOCK: { message: "There is not enough standard stock at this location.", status: 409 },
        INVALID_INPUT_QUANTITY: { message: "When a material conversion is configured, open whole regular stock units only.", status: 400 },
        SOURCE_REMNANT_NOT_AVAILABLE: { message: "The selected remnant is no longer available in this location or does not match the selected product/variant.", status: 409 },
        STOCK_BALANCE_MISMATCH: { message: "Remnant stock balance does not match its individual records. Reconcile inventory before processing.", status: 409 },
        OUTPUT_QUANTITY_EXCEEDED: { message: "Consumed quantity plus all remnant outputs cannot exceed the source quantity.", status: 400 },
        NO_PROCESSING_OUTPUT: { message: "Enter a consumed quantity or at least one remnant output.", status: 400 },
      };
      return NextResponse.json({ error: errors[result.error].message }, { status: errors[result.error].status });
    }
    return NextResponse.json({ ...result, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "MATERIAL_SOURCE_STOCK_CHANGED") {
      return NextResponse.json({ error: "Stock changed while processing. Refresh inventory and retry." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Duplicate request or remnant code. Retry the operation." }, { status: 409 });
    throw error;
  }
}
