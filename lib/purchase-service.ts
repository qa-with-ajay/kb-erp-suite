import { Prisma } from "@prisma/client";
import type { purchaseOrderInputSchema, purchaseReceiptInputSchema } from "@/lib/purchase-validation";
import type { z } from "zod";

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;
export type PurchaseReceiptInput = z.infer<typeof purchaseReceiptInputSchema>;

type PurchaseMovement = Prisma.StockMovementGetPayload<{
  include: { purchaseReceipt: { include: { lines: true } } };
}>;

type PurchaseOrderWithLines = Prisma.PurchaseOrderGetPayload<{ include: { lines: true } }>;

export type PurchaseResult =
  | { kind: "created" | "replayed"; id: string; number?: string }
  | {
      kind: "error";
      error:
        | "SUPPLIER_NOT_AVAILABLE"
        | "PRODUCT_NOT_AVAILABLE"
        | "VARIANT_REQUIRED"
        | "VARIANT_NOT_AVAILABLE"
        | "PURCHASE_UNIT_NOT_AVAILABLE"
        | "CONVERSION_ROUNDS_TO_ZERO"
        | "ORDER_NOT_AVAILABLE"
        | "ORDER_CLOSED"
        | "ORDER_LINE_NOT_AVAILABLE"
        | "OVER_RECEIPT"
        | "LOCATION_NOT_AVAILABLE"
        | "IDEMPOTENCY_CONFLICT"
        | "AMOUNT_LIMIT_EXCEEDED";
      productName?: string;
    };

export function isSamePurchaseOrderRequest(
  existing: PurchaseOrderWithLines,
  input: PurchaseOrderInput,
  businessUnitId: string,
) {
  if (
    existing.businessUnitId !== businessUnitId ||
    existing.supplierId !== input.supplierId ||
    existing.taxMode !== input.taxMode ||
    existing.expectedDate?.toISOString() !== (input.expectedDate ? new Date(input.expectedDate).toISOString() : undefined) ||
    existing.notes !== (input.notes || null) ||
    existing.lines.length !== input.lines.length
  ) return false;
  const savedLines = new Map(existing.lines.map((line) => [
    `${line.productId}:${line.variantId || ""}:${line.purchaseUnit}`,
    line,
  ]));
  return input.lines.every((line) => {
    const saved = savedLines.get(`${line.productId}:${line.variantId || ""}:${line.purchaseUnit}`);
    return saved !== undefined &&
      saved.purchaseQuantity.equals(line.purchaseQuantity) &&
      saved.purchaseUnit === line.purchaseUnit &&
      saved.unitCost.equals(line.unitCost) &&
      saved.gstPercentage.equals(line.gstPercentage);
  });
}

const maximumAmount = new Prisma.Decimal("999999999999.99");
const roundingMethods = {
  HALF_UP: Prisma.Decimal.ROUND_HALF_UP,
  HALF_EVEN: Prisma.Decimal.ROUND_HALF_EVEN,
  DOWN: Prisma.Decimal.ROUND_DOWN,
  UP: Prisma.Decimal.ROUND_UP,
} as const;

function convertPurchaseQuantity(
  quantity: Prisma.Decimal,
  factor: Prisma.Decimal,
  precision: number,
  roundingMode: keyof typeof roundingMethods,
) {
  return quantity.mul(factor).toDecimalPlaces(precision, roundingMethods[roundingMode]);
}

function lineAmounts(quantity: Prisma.Decimal, unitCost: Prisma.Decimal, gst: Prisma.Decimal, taxMode: "GST" | "NON_GST") {
  const subtotal = unitCost.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const tax = taxMode === "GST"
    ? subtotal.mul(gst).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(0);
  return { subtotal, tax, total: subtotal.plus(tax) };
}

function amountsExceedLimit(values: Prisma.Decimal[]) {
  return values.some((value) => value.greaterThan(maximumAmount));
}

export async function createPurchaseOrder(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  businessUnitCode: string,
  actorId: string,
  input: PurchaseOrderInput,
): Promise<PurchaseResult> {
  const existing = await tx.purchaseOrder.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true },
  });
  if (existing) {
    return isSamePurchaseOrderRequest(existing, input, businessUnitId)
      ? { kind: "replayed", id: existing.id, number: existing.orderNumber }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }

  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, businessUnitId, isActive: true },
    select: { id: true },
  });
  if (!supplier) return { kind: "error", error: "SUPPLIER_NOT_AVAILABLE" };

  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const products = await tx.product.findMany({
    where: { businessUnitId, id: { in: productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      baseUnit: true,
      variants: { where: { isActive: true }, select: { id: true, code: true, attributes: true } },
      unitConversions: {
        where: { isPurchaseUnit: true },
        select: { unit: true, conversionFactor: true, precision: true, roundingMode: true },
      },
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  const preparedLines: Array<{
    product: (typeof products)[number];
    variant: (typeof products)[number]["variants"][number] | null;
    purchaseQuantity: Prisma.Decimal;
    purchaseUnit: PurchaseOrderInput["lines"][number]["purchaseUnit"];
    conversionFactor: Prisma.Decimal;
    conversionPrecision: number;
    roundingMode: keyof typeof roundingMethods;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    purchaseUnitCost: Prisma.Decimal;
    gst: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);

  for (const line of input.lines) {
    const product = productById.get(line.productId);
    if (!product) return { kind: "error", error: "PRODUCT_NOT_AVAILABLE" };
    if (product.variants.length && !line.variantId) {
      return { kind: "error", error: "VARIANT_REQUIRED", productName: product.name };
    }
    const variant = line.variantId
      ? product.variants.find((candidate) => candidate.id === line.variantId)
      : null;
    if (line.variantId && !variant) {
      return { kind: "error", error: "VARIANT_NOT_AVAILABLE", productName: product.name };
    }
    const conversion = line.purchaseUnit === product.baseUnit
      ? {
          conversionFactor: new Prisma.Decimal(1),
          precision: 8,
          roundingMode: "HALF_UP" as const,
        }
      : product.unitConversions.find((candidate) => candidate.unit === line.purchaseUnit);
    if (!conversion) return { kind: "error", error: "PURCHASE_UNIT_NOT_AVAILABLE", productName: product.name };
    const purchaseQuantity = new Prisma.Decimal(line.purchaseQuantity);
    const purchaseUnitCost = new Prisma.Decimal(line.unitCost);
    const quantity = convertPurchaseQuantity(
      purchaseQuantity,
      conversion.conversionFactor,
      conversion.precision,
      conversion.roundingMode,
    );
    if (!quantity.greaterThan(0)) {
      return { kind: "error", error: "CONVERSION_ROUNDS_TO_ZERO", productName: product.name };
    }
    const unitCost = purchaseUnitCost.div(conversion.conversionFactor)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const gst = new Prisma.Decimal(line.gstPercentage);
    const amounts = lineAmounts(purchaseQuantity, purchaseUnitCost, gst, input.taxMode);
    if (amountsExceedLimit([unitCost, purchaseUnitCost, amounts.subtotal, amounts.tax, amounts.total])) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
    preparedLines.push({
      product,
      variant: variant ?? null,
      purchaseQuantity,
      purchaseUnit: line.purchaseUnit,
      conversionFactor: conversion.conversionFactor,
      conversionPrecision: conversion.precision,
      roundingMode: conversion.roundingMode,
      quantity,
      unitCost,
      purchaseUnitCost,
      gst,
      ...amounts,
    });
    subtotal = subtotal.plus(amounts.subtotal);
    taxAmount = taxAmount.plus(amounts.tax);
    total = total.plus(amounts.total);
    if (amountsExceedLimit([subtotal, taxAmount, total])) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
  }

  const sequence = await tx.businessUnit.update({
    where: { id: businessUnitId },
    data: { nextPurchaseOrderNo: { increment: 1 } },
    select: { nextPurchaseOrderNo: true },
  });
  const orderNumber = `${businessUnitCode}-PO-${String(sequence.nextPurchaseOrderNo - 1).padStart(6, "0")}`;
  const order = await tx.purchaseOrder.create({
    data: {
      businessUnitId,
      supplierId: supplier.id,
      orderNumber,
      idempotencyKey: input.idempotencyKey,
      taxMode: input.taxMode,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
      notes: input.notes || null,
      subtotal,
      taxAmount,
      total,
      createdBy: actorId,
      lines: {
        create: preparedLines.map((line, index) => ({
          lineNumber: index + 1,
          productId: line.product.id,
          variantId: line.variant?.id ?? null,
          productName: line.product.name,
          sku: line.product.sku,
          baseUnit: line.product.baseUnit,
          variantCode: line.variant?.code ?? null,
          variantAttributes: line.variant?.attributes ?? Prisma.DbNull,
          purchaseQuantity: line.purchaseQuantity,
          purchaseUnit: line.purchaseUnit,
          conversionFactor: line.conversionFactor,
          conversionPrecision: line.conversionPrecision,
          roundingMode: line.roundingMode,
          quantity: line.quantity,
          receivedPurchaseQuantity: new Prisma.Decimal(0),
          unitCost: line.unitCost,
          purchaseUnitCost: line.purchaseUnitCost,
          gstPercentage: line.gst,
          lineSubtotal: line.subtotal,
          lineTax: line.tax,
          lineTotal: line.total,
        })),
      },
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "PurchaseOrder",
      entityId: order.id,
      details: { orderNumber, supplierId: supplier.id, lineCount: preparedLines.length, total: total.toString() },
    },
  });
  return { kind: "created", id: order.id, number: orderNumber };
}

export function isSamePurchaseReceiptRequest(
  movement: PurchaseMovement,
  input: PurchaseReceiptInput,
  businessUnitId: string,
) {
  const receipt = movement.purchaseReceipt;
  if (
    movement.type !== "PURCHASE_IN" ||
    movement.businessUnitId !== businessUnitId ||
    movement.destinationLocationId !== input.locationId ||
    movement.sourceLocationId !== null ||
    !receipt ||
    receipt.purchaseOrderId !== input.purchaseOrderId ||
    receipt.supplierInvoiceNumber !== input.supplierInvoiceNumber ||
    receipt.supplierInvoiceDate?.toISOString() !==
      (input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate).toISOString() : undefined) ||
    receipt.lines.length !== input.lines.length
  ) return false;
  const lines = new Map(receipt.lines.map((line) => [line.purchaseOrderLineId, line]));
  return input.lines.every((line) => lines.get(line.purchaseOrderLineId)?.purchaseQuantity.equals(line.purchaseQuantity));
}

export async function receivePurchaseOrder(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  input: PurchaseReceiptInput,
): Promise<PurchaseResult> {
  const previous = await tx.stockMovement.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    include: { purchaseReceipt: { include: { lines: true } } },
  });
  if (previous) {
    return isSamePurchaseReceiptRequest(previous, input, businessUnitId) && previous.purchaseReceipt
      ? { kind: "replayed", id: previous.purchaseReceipt.id }
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

  const orderRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseOrder"
    WHERE "id" = ${input.purchaseOrderId}::uuid
      AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!orderRows.length) return { kind: "error", error: "ORDER_NOT_AVAILABLE" };
  const order = await tx.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, businessUnitId },
    include: { lines: true },
  });
  if (!order) return { kind: "error", error: "ORDER_NOT_AVAILABLE" };
  if (order.status === "RECEIVED") return { kind: "error", error: "ORDER_CLOSED" };

  const orderLines = new Map(order.lines.map((line) => [line.id, line]));
  const preparedLines: Array<{
    orderLine: (typeof order.lines)[number];
    purchaseQuantity: Prisma.Decimal;
    receivedPurchaseQuantity: Prisma.Decimal;
    quantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  for (const inputLine of input.lines) {
    const orderLine = orderLines.get(inputLine.purchaseOrderLineId);
    if (!orderLine) return { kind: "error", error: "ORDER_LINE_NOT_AVAILABLE" };
    const purchaseQuantity = new Prisma.Decimal(inputLine.purchaseQuantity);
    if (purchaseQuantity.greaterThan(orderLine.purchaseQuantity.minus(orderLine.receivedPurchaseQuantity))) {
      return { kind: "error", error: "OVER_RECEIPT", productName: orderLine.productName };
    }
    const receivedPurchaseQuantity = orderLine.receivedPurchaseQuantity.plus(purchaseQuantity);
    const previousBaseQuantity = convertPurchaseQuantity(
      orderLine.receivedPurchaseQuantity,
      orderLine.conversionFactor,
      orderLine.conversionPrecision,
      orderLine.roundingMode,
    );
    const totalBaseQuantity = convertPurchaseQuantity(
      receivedPurchaseQuantity,
      orderLine.conversionFactor,
      orderLine.conversionPrecision,
      orderLine.roundingMode,
    );
    const quantity = totalBaseQuantity.minus(previousBaseQuantity);
    if (totalBaseQuantity.greaterThan(orderLine.quantity)) {
      return { kind: "error", error: "OVER_RECEIPT", productName: orderLine.productName };
    }
    const amounts = lineAmounts(purchaseQuantity, orderLine.purchaseUnitCost, orderLine.gstPercentage, order.taxMode);
    if (amountsExceedLimit([amounts.subtotal, amounts.tax, amounts.total])) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
    preparedLines.push({ orderLine, purchaseQuantity, receivedPurchaseQuantity, quantity, ...amounts });
    subtotal = subtotal.plus(amounts.subtotal);
    taxAmount = taxAmount.plus(amounts.tax);
    total = total.plus(amounts.total);
    if (amountsExceedLimit([subtotal, taxAmount, total])) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
  }

  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId,
      type: "PURCHASE_IN",
      actorId,
      destinationLocationId: input.locationId,
      reference: input.supplierInvoiceNumber,
      idempotencyKey: input.idempotencyKey,
      reason: `Purchase order ${order.orderNumber} receipt`,
    },
  });
  const receipt = await tx.purchaseReceipt.create({
    data: {
      businessUnitId,
      stockMovementId: movement.id,
      purchaseOrderId: order.id,
      supplierId: order.supplierId,
      locationId: input.locationId,
      supplierInvoiceNumber: input.supplierInvoiceNumber,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null,
      taxMode: order.taxMode,
      subtotal,
      taxAmount,
      total,
      receivedBy: actorId,
    },
  });

  for (const [index, line] of preparedLines.entries()) {
    const orderLine = line.orderLine;
    const balanceWhere = {
      businessUnitId,
      locationId: input.locationId,
      productId: orderLine.productId,
      variantId: orderLine.variantId,
      stockKind: "STANDARD" as const,
    };
    const balance = await tx.stockBalance.findFirst({ where: balanceWhere });
    const oldQuantity = balance?.quantity ?? new Prisma.Decimal(0);
    const newQuantity = oldQuantity.plus(line.quantity);
    const oldCost = balance?.averageCost ?? new Prisma.Decimal(0);
    const newAverageCost = newQuantity.greaterThan(0)
      ? oldQuantity.mul(oldCost).plus(line.quantity.mul(orderLine.unitCost))
        .div(newQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
      : orderLine.unitCost;
    if (line.quantity.greaterThan(0)) {
      await tx.stockLedgerEntry.create({
        data: {
          businessUnitId,
          movementId: movement.id,
          productId: orderLine.productId,
          variantId: orderLine.variantId,
          locationId: input.locationId,
          stockKind: "STANDARD",
          quantityDelta: line.quantity,
          unitCost: orderLine.unitCost,
        },
      });
      if (balance) {
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { quantity: newQuantity, averageCost: newAverageCost },
        });
      } else {
        await tx.stockBalance.create({ data: { ...balanceWhere, quantity: newQuantity, averageCost: newAverageCost } });
      }
    }
    await tx.purchaseReceiptLine.create({
      data: {
        businessUnitId,
        purchaseReceiptId: receipt.id,
        purchaseOrderLineId: orderLine.id,
        lineNumber: index + 1,
        productId: orderLine.productId,
        variantId: orderLine.variantId,
        productName: orderLine.productName,
        sku: orderLine.sku,
        baseUnit: orderLine.baseUnit,
        variantCode: orderLine.variantCode,
        variantAttributes: orderLine.variantAttributes ?? Prisma.DbNull,
        purchaseQuantity: line.purchaseQuantity,
        purchaseUnit: orderLine.purchaseUnit,
        conversionFactor: orderLine.conversionFactor,
        conversionPrecision: orderLine.conversionPrecision,
        roundingMode: orderLine.roundingMode,
        quantity: line.quantity,
        unitCost: orderLine.unitCost,
        purchaseUnitCost: orderLine.purchaseUnitCost,
        gstPercentage: orderLine.gstPercentage,
        lineSubtotal: line.subtotal,
        lineTax: line.tax,
        lineTotal: line.total,
      },
    });
    await tx.purchaseOrderLine.update({
      where: { id: orderLine.id },
      data: {
        receivedPurchaseQuantity: line.receivedPurchaseQuantity,
        receivedQuantity: { increment: line.quantity },
      },
    });
  }

  const updatedLines = await tx.purchaseOrderLine.findMany({
    where: { businessUnitId, purchaseOrderId: order.id },
    select: { purchaseQuantity: true, receivedPurchaseQuantity: true },
  });
  const fullyReceived = updatedLines.every((line) => line.receivedPurchaseQuantity.greaterThanOrEqualTo(line.purchaseQuantity));
  await tx.purchaseOrder.update({
    where: { id: order.id },
    data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "PurchaseReceipt",
      entityId: receipt.id,
      details: {
        orderNumber: order.orderNumber,
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        lineCount: preparedLines.length,
        total: total.toString(),
      },
    },
  });
  return { kind: "created", id: receipt.id };
}
