import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";

type Context = { params: Promise<{ id: string }> };
const actionSchema = z.object({
  action: z.enum(["SOLD", "CONSUMED", "WASTED", "TRANSFER"]),
  quantity: z.coerce.number().positive().optional(),
  destinationLocationId: z.string().uuid().optional(),
  reference: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function PATCH(request: Request, { params }: Context) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit, session } = access.context;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid remnant ID." }, { status: 400 });
  }
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = actionSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid remnant action.", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.stockMovement.findFirst({ where: { businessUnitId: businessUnit.id, idempotencyKey: input.idempotencyKey } });
      if (prior) return { error: "IDEMPOTENCY_CONFLICT" as const };
      const current = await tx.materialRemnant.findFirst({ where: { id, businessUnitId: businessUnit.id } });
      if (!current) return { error: "NOT_FOUND" as const };
      if (current.status !== "AVAILABLE") return { error: "NOT_AVAILABLE" as const };

      const locationIds = input.action === "TRANSFER"
        ? [current.locationId, input.destinationLocationId ?? ""].sort()
        : [current.locationId];
      if (input.action === "TRANSFER" && (!input.destinationLocationId || input.destinationLocationId === current.locationId)) return { error: "INVALID_DESTINATION" as const };
      for (const locationId of locationIds) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "StockLocation" WHERE "id" = ${locationId}::uuid
          AND "businessUnitId" = ${businessUnit.id}::uuid AND "isActive" = true FOR UPDATE
        `;
        if (!locked.length) return { error: "LOCATION_NOT_AVAILABLE" as const };
      }
      const lockedRemnant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Remnant" WHERE "id" = ${id}::uuid AND "businessUnitId" = ${businessUnit.id}::uuid FOR UPDATE
      `;
      if (!lockedRemnant.length) return { error: "NOT_FOUND" as const };
      const fresh = await tx.materialRemnant.findFirst({ where: { id, businessUnitId: businessUnit.id } });
      if (!fresh || fresh.status !== "AVAILABLE") return { error: "NOT_AVAILABLE" as const };
      const quantity = input.action === "TRANSFER" ? fresh.quantity : new Prisma.Decimal(input.quantity ?? fresh.quantity);
      if (quantity.lte(0) || quantity.gt(fresh.quantity)) return { error: "INVALID_QUANTITY" as const };

      const isTransfer = input.action === "TRANSFER";
      const destinationLocationId = isTransfer ? input.destinationLocationId! : null;
      const stockMovementType = isTransfer ? "TRANSFER" : "OUTWARD";
      const movement = await tx.stockMovement.create({
        data: {
          businessUnitId: businessUnit.id, actorId: session.user.id, type: stockMovementType,
          sourceLocationId: fresh.locationId, destinationLocationId,
          reference: input.reference || null, idempotencyKey: input.idempotencyKey,
          reason: input.reason || (isTransfer ? "Remnant transferred." : `Remnant marked ${input.action.toLowerCase()}.`),
        },
      });
      const sourceWhere = { businessUnitId: businessUnit.id, locationId: fresh.locationId, productId: fresh.productId, variantId: fresh.variantId, stockKind: "REMNANT" as const };
      const sourceBalance = await tx.stockBalance.findFirst({ where: sourceWhere });
      if (!sourceBalance || sourceBalance.quantity.lt(quantity)) return { error: "STOCK_BALANCE_MISMATCH" as const };
      const destinationBalance = isTransfer ? await tx.stockBalance.findFirst({
        where: { ...sourceWhere, locationId: destinationLocationId! },
      }) : null;
      const entries = [{
        businessUnitId: businessUnit.id, movementId: movement.id, productId: fresh.productId,
        variantId: fresh.variantId, locationId: fresh.locationId, stockKind: "REMNANT" as const,
        quantityDelta: quantity.negated(), unitCost: sourceBalance.averageCost,
      }];
      if (isTransfer) entries.push({
        businessUnitId: businessUnit.id, movementId: movement.id, productId: fresh.productId,
        variantId: fresh.variantId, locationId: destinationLocationId!, stockKind: "REMNANT" as const,
        quantityDelta: quantity, unitCost: sourceBalance.averageCost,
      });
      await tx.stockLedgerEntry.createMany({ data: entries });
      if (isTransfer) {
        await tx.stockBalance.update({ where: { id: sourceBalance.id }, data: { quantity: sourceBalance.quantity.minus(quantity) } });
        const destNext = (destinationBalance?.quantity ?? new Prisma.Decimal(0)).plus(quantity);
        if (destinationBalance) await tx.stockBalance.update({ where: { id: destinationBalance.id }, data: { quantity: destNext } });
        else await tx.stockBalance.create({ data: { ...sourceWhere, locationId: destinationLocationId!, quantity: quantity, averageCost: sourceBalance.averageCost } });
        await tx.materialRemnant.update({ where: { id: fresh.id }, data: { locationId: destinationLocationId! } });
        await tx.materialRemnantMovement.createMany({
          data: [
            { businessUnitId: businessUnit.id, remnantId: fresh.id, locationId: fresh.locationId, actorId: session.user.id, type: "TRANSFERRED", quantityDelta: quantity.negated(), reason: input.reason || "Transferred out." },
            { businessUnitId: businessUnit.id, remnantId: fresh.id, locationId: destinationLocationId!, actorId: session.user.id, type: "TRANSFERRED", quantityDelta: quantity, reason: input.reason || "Transferred in." },
          ],
        });
      } else {
        const remaining = fresh.quantity.minus(quantity);
        await tx.stockBalance.update({ where: { id: sourceBalance.id }, data: { quantity: sourceBalance.quantity.minus(quantity) } });
        await tx.materialRemnant.update({
          where: { id: fresh.id },
          data: { quantity: remaining, ...(remaining.isZero() ? { status: input.action } : {}) },
        });
        await tx.materialRemnantMovement.create({
          data: {
            businessUnitId: businessUnit.id, remnantId: fresh.id, locationId: fresh.locationId,
            actorId: session.user.id, type: input.action, quantityDelta: quantity.negated(),
            reason: input.reason || (input.action === "SOLD" ? `Sold; reference: ${input.reference || "not supplied"}` : `Marked ${input.action.toLowerCase()}.`),
          },
        });
      }
      await tx.auditLog.create({
        data: { userId: session.user.id, businessUnitId: businessUnit.id, action: "UPDATE",
          entity: "MaterialRemnant", entityId: fresh.id,
          details: { action: input.action, quantity: quantity.toString(), unit: fresh.unit, reference: input.reference || null, destinationLocationId } },
      });
      return { movementId: movement.id, remnantId: fresh.id };
    });
    if ("error" in result) {
      const messages: Record<string, [string, number]> = {
        IDEMPOTENCY_CONFLICT: ["This request key has already been used.", 409],
        NOT_FOUND: ["Remnant not found.", 404],
        NOT_AVAILABLE: ["Only available remnants can be moved.", 409],
        INVALID_QUANTITY: ["Quantity must be positive and cannot exceed the available remnant quantity.", 400],
        INVALID_DESTINATION: ["Choose a different destination location.", 400],
        LOCATION_NOT_AVAILABLE: ["Select an active location in this business unit.", 400],
        STOCK_BALANCE_MISMATCH: ["Remnant record and remnant stock balance do not agree. Reconcile stock before retrying.", 409],
      };
      return NextResponse.json({ error: messages[result.error][0] }, { status: messages[result.error][1] });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Duplicate remnant action. Refresh and retry." }, { status: 409 });
    throw error;
  }
}
