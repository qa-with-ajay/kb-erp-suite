import { Prisma } from "@prisma/client";

export type StockMovementInput = {
  type: "OPENING" | "INWARD" | "OUTWARD" | "ADJUSTMENT";
  locationId: string;
  productId: string;
  variantId?: string | null;
  quantity: string;
  adjustmentDirection?: "INCREASE" | "DECREASE";
  unitCost?: string;
  reference?: string | null;
  reason?: string | null;
  idempotencyKey: string;
};

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
        | "INSUFFICIENT_STOCK";
    };

function getQuantityDelta(input: StockMovementInput) {
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

export async function createStockMovement(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  input: StockMovementInput,
): Promise<StockMovementResult> {
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

  const locationRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${input.locationId}::uuid
      AND "businessUnitId" = ${businessUnitId}::uuid
      AND "isActive" = true
    FOR UPDATE
  `;
  if (!locationRows.length) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const product = await tx.product.findFirst({
    where: { id: input.productId, businessUnitId, isActive: true },
    select: {
      id: true,
      variants: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
  });
  if (!product) return { kind: "error", error: "PRODUCT_NOT_AVAILABLE" };
  if (product.variants.length && !input.variantId) return { kind: "error", error: "VARIANT_REQUIRED" };
  if (input.variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, productId: product.id, businessUnitId, isActive: true },
      select: { id: true },
    });
    if (!variant) return { kind: "error", error: "VARIANT_NOT_AVAILABLE" };
  }

  const balanceWhere = {
    businessUnitId,
    locationId: input.locationId,
    productId: product.id,
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
  const sourceLocationId = delta.isNegative() ? input.locationId : null;
  const destinationLocationId = delta.isPositive() ? input.locationId : null;

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
      productId: product.id,
      variantId: input.variantId || null,
      locationId: input.locationId,
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
        productId: product.id,
        variantId: input.variantId || null,
        locationId: input.locationId,
        quantityDelta: delta.toString(),
        unitCost: ledgerUnitCost.toString(),
        reference: input.reference || null,
      },
    },
  });
  return { kind: "created", movementId: movement.id };
}
