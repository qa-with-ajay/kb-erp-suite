import { Prisma } from "@prisma/client";

type StockMovementCommon = {
  productId: string;
  variantId?: string | null;
  quantity: string;
  reference?: string | null;
  reason?: string | null;
  idempotencyKey: string;
};

export type StockMovementInput =
  | (StockMovementCommon & {
      type: "TRANSFER";
      sourceLocationId: string;
      destinationLocationId: string;
      locationId?: never;
      adjustmentDirection?: never;
      unitCost?: never;
    })
  | (StockMovementCommon & {
      type: "OPENING" | "INWARD" | "OUTWARD" | "ADJUSTMENT";
      locationId: string;
      sourceLocationId?: never;
      destinationLocationId?: never;
      adjustmentDirection?: "INCREASE" | "DECREASE";
      unitCost?: string;
    });

type MovementWithEntries = Prisma.StockMovementGetPayload<{ include: { ledgerEntries: true } }>;

export type StockMovementResult =
  | { kind: "created" | "replayed"; movementId: string }
  | {
      kind: "error";
      error:
        | "IDEMPOTENCY_CONFLICT"
        | "LOCATION_NOT_AVAILABLE"
        | "PRODUCT_NOT_AVAILABLE"
        | "VARIANT_REQUIRED"
        | "VARIANT_NOT_AVAILABLE"
        | "OPENING_ALREADY_RECORDED"
        | "INSUFFICIENT_STOCK"
        | "UNIT_COST_REQUIRED"
        | "INVALID_TRANSFER_LOCATIONS";
    };

function getQuantityDelta(input: Exclude<StockMovementInput, { type: "TRANSFER" }>) {
  const quantity = new Prisma.Decimal(input.quantity);
  return input.type === "OUTWARD" ||
    (input.type === "ADJUSTMENT" && input.adjustmentDirection === "DECREASE")
    ? quantity.negated()
    : quantity;
}

export function isSameStockMovementRequest(
  existing: MovementWithEntries,
  input: StockMovementInput,
  businessUnitId: string,
) {
  if (input.type === "TRANSFER") {
    const quantity = new Prisma.Decimal(input.quantity);
    const sourceEntry = existing.ledgerEntries.find((entry) => entry.locationId === input.sourceLocationId);
    const destinationEntry = existing.ledgerEntries.find((entry) => entry.locationId === input.destinationLocationId);
    return existing.businessUnitId === businessUnitId &&
      existing.type === "TRANSFER" &&
      existing.sourceLocationId === input.sourceLocationId &&
      existing.destinationLocationId === input.destinationLocationId &&
      existing.reference === (input.reference || null) &&
      existing.reason === (input.reason || null) &&
      existing.ledgerEntries.length === 2 &&
      Boolean(sourceEntry && destinationEntry) &&
      sourceEntry!.productId === input.productId &&
      destinationEntry!.productId === input.productId &&
      sourceEntry!.variantId === (input.variantId || null) &&
      destinationEntry!.variantId === (input.variantId || null) &&
      sourceEntry!.quantityDelta.equals(quantity.negated()) &&
      destinationEntry!.quantityDelta.equals(quantity) &&
      sourceEntry!.unitCost.equals(destinationEntry!.unitCost);
  }

  const delta = getQuantityDelta(input);
  const sourceLocationId = delta.isNegative() ? input.locationId : null;
  const destinationLocationId = delta.isPositive() ? input.locationId : null;
  const entry = existing.ledgerEntries[0];
  return existing.businessUnitId === businessUnitId &&
    existing.type === input.type &&
    existing.sourceLocationId === sourceLocationId &&
    existing.destinationLocationId === destinationLocationId &&
    existing.reference === (input.reference || null) &&
    existing.reason === (input.reason || null) &&
    existing.ledgerEntries.length === 1 &&
    entry.productId === input.productId &&
    entry.variantId === (input.variantId || null) &&
    entry.locationId === input.locationId &&
    entry.quantityDelta.equals(delta) &&
    (delta.isNegative() || (input.unitCost !== undefined && entry.unitCost.equals(input.unitCost)));
}

async function validateProductAndVariant(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  productId: string,
  variantId?: string | null,
) {
  const product = await tx.product.findFirst({
    where: { id: productId, businessUnitId, isActive: true },
    select: {
      id: true,
      variants: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
  });
  if (!product) return { error: "PRODUCT_NOT_AVAILABLE" as const };
  if (product.variants.length && !variantId) return { error: "VARIANT_REQUIRED" as const };
  if (variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId: product.id, businessUnitId, isActive: true },
      select: { id: true },
    });
    if (!variant) return { error: "VARIANT_NOT_AVAILABLE" as const };
  }
  return { productId: product.id };
}

export async function createStockMovement(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  if (input.type !== "TRANSFER" &&
      (input.type === "INWARD" || (input.type === "ADJUSTMENT" && input.adjustmentDirection === "INCREASE")) &&
      input.unitCost === undefined) {
    return { kind: "error", error: "UNIT_COST_REQUIRED" };
  }

  const prior = await tx.stockMovement.findUnique({
    where: {
      businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey },
    },
    include: { ledgerEntries: true },
  });
  if (prior) {
    return isSameStockMovementRequest(prior, input, businessUnitId)
      ? { kind: "replayed", movementId: prior.id }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }

  if (input.type === "TRANSFER") {
    if (input.sourceLocationId === input.destinationLocationId) {
      return { kind: "error", error: "INVALID_TRANSFER_LOCATIONS" };
    }

    // Lock both locations in a deterministic order so concurrent transfers cannot deadlock.
    for (const locationId of [input.sourceLocationId, input.destinationLocationId].sort()) {
      const locationRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockLocation"
        WHERE "id" = ${locationId}::uuid
          AND "businessUnitId" = ${businessUnitId}::uuid
          AND "isActive" = true
        FOR UPDATE
      `;
      if (!locationRows.length) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };
    }

    const validated = await validateProductAndVariant(tx, businessUnitId, input.productId, input.variantId);
    if ("error" in validated) return { kind: "error", error: validated.error };

    const sourceWhere = {
      businessUnitId, locationId: input.sourceLocationId, productId: validated.productId,
      variantId: input.variantId || null, stockKind: "STANDARD" as const,
    };
    const destinationWhere = {
      businessUnitId, locationId: input.destinationLocationId, productId: validated.productId,
      variantId: input.variantId || null, stockKind: "STANDARD" as const,
    };
    const [sourceBalance, destinationBalance] = await Promise.all([
      tx.stockBalance.findFirst({ where: sourceWhere }),
      tx.stockBalance.findFirst({ where: destinationWhere }),
    ]);
    const quantity = new Prisma.Decimal(input.quantity);
    const sourceQuantity = sourceBalance?.quantity ?? new Prisma.Decimal(0);
    if (sourceQuantity.lt(quantity)) return { kind: "error", error: "INSUFFICIENT_STOCK" };

    const sourceAverageCost = sourceBalance?.averageCost ?? new Prisma.Decimal(0);
    const destinationQuantity = destinationBalance?.quantity ?? new Prisma.Decimal(0);
    const nextDestinationQuantity = destinationQuantity.plus(quantity);
    const nextDestinationAverageCost = destinationBalance && nextDestinationQuantity.isPositive()
      ? destinationQuantity.mul(destinationBalance.averageCost).plus(quantity.mul(sourceAverageCost))
          .div(nextDestinationQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
      : sourceAverageCost;

    const movement = await tx.stockMovement.create({
      data: {
        businessUnitId, type: "TRANSFER", actorId,
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        reference: input.reference || null,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || "Stock transferred between locations.",
      },
    });
    await tx.stockLedgerEntry.createMany({
      data: [
        {
          businessUnitId, movementId: movement.id, productId: validated.productId,
          variantId: input.variantId || null, locationId: input.sourceLocationId,
          stockKind: "STANDARD", quantityDelta: quantity.negated(), unitCost: sourceAverageCost,
        },
        {
          businessUnitId, movementId: movement.id, productId: validated.productId,
          variantId: input.variantId || null, locationId: input.destinationLocationId,
          stockKind: "STANDARD", quantityDelta: quantity, unitCost: sourceAverageCost,
        },
      ],
    });
    if (sourceBalance) {
      await tx.stockBalance.update({
        where: { id: sourceBalance.id },
        data: { quantity: sourceQuantity.minus(quantity) },
      });
    }
    if (destinationBalance) {
      await tx.stockBalance.update({
        where: { id: destinationBalance.id },
        data: { quantity: nextDestinationQuantity, averageCost: nextDestinationAverageCost },
      });
    } else {
      await tx.stockBalance.create({
        data: { ...destinationWhere, quantity: nextDestinationQuantity, averageCost: nextDestinationAverageCost },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId, businessUnitId, action: "CREATE", entity: "StockMovement", entityId: movement.id,
        details: {
          type: "TRANSFER", productId: validated.productId, variantId: input.variantId || null,
          sourceLocationId: input.sourceLocationId, destinationLocationId: input.destinationLocationId,
          quantity: quantity.toString(), unitCost: sourceAverageCost.toString(), reference: input.reference || null,
        },
      },
    });
    return { kind: "created", movementId: movement.id };
  }

  const locationId = input.locationId;
  const locationRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${locationId}::uuid
      AND "businessUnitId" = ${businessUnitId}::uuid
      AND "isActive" = true
    FOR UPDATE
  `;
  if (!locationRows.length) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const validated = await validateProductAndVariant(tx, businessUnitId, input.productId, input.variantId);
  if ("error" in validated) return { kind: "error", error: validated.error };

  const balanceWhere = {
    businessUnitId,
    locationId,
    productId: validated.productId,
    variantId: input.variantId || null,
    stockKind: "STANDARD" as const,
  };
  const balance = await tx.stockBalance.findFirst({ where: balanceWhere });
  if (input.type === "OPENING") {
    const priorEntries = await tx.stockLedgerEntry.count({ where: balanceWhere });
    if (priorEntries > 0) return { kind: "error", error: "OPENING_ALREADY_RECORDED" };
  }

  const delta = getQuantityDelta(input);
  const currentQuantity = balance?.quantity ?? new Prisma.Decimal(0);
  const newQuantity = currentQuantity.plus(delta);
  if (newQuantity.isNegative()) return { kind: "error", error: "INSUFFICIENT_STOCK" };

  const suppliedCost = input.unitCost ? new Prisma.Decimal(input.unitCost) : null;
  const ledgerUnitCost = delta.isPositive()
    ? suppliedCost ?? new Prisma.Decimal(0)
    : balance?.averageCost ?? new Prisma.Decimal(0);
  const newAverageCost = delta.isPositive()
    ? (balance && newQuantity.isPositive()
      ? currentQuantity.mul(balance.averageCost).plus(delta.mul(ledgerUnitCost)).div(newQuantity)
      : ledgerUnitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
    : balance?.averageCost ?? new Prisma.Decimal(0);
  const sourceLocationId = delta.isNegative() ? locationId : null;
  const destinationLocationId = delta.isPositive() ? locationId : null;

  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId,
      type: input.type,
      actorId,
      sourceLocationId,
      destinationLocationId,
      reference: input.reference || null,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason || null,
    },
  });
  await tx.stockLedgerEntry.create({
    data: {
      businessUnitId,
      movementId: movement.id,
      productId: validated.productId,
      variantId: input.variantId || null,
      locationId,
      stockKind: "STANDARD",
      quantityDelta: delta,
      unitCost: ledgerUnitCost,
    },
  });
  if (balance) {
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: newQuantity, averageCost: newAverageCost },
    });
  } else {
    await tx.stockBalance.create({
      data: { ...balanceWhere, quantity: newQuantity, averageCost: newAverageCost },
    });
  }
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "StockMovement",
      entityId: movement.id,
      details: {
        type: input.type,
        productId: validated.productId,
        variantId: input.variantId || null,
        locationId,
        quantityDelta: delta.toString(),
        unitCost: ledgerUnitCost.toString(),
        reference: input.reference || null,
      },
    },
  });
  return { kind: "created", movementId: movement.id };
}
