import { Prisma } from "@prisma/client";
import type { purchaseReturnInputSchema, returnReversalInputSchema, saleReturnInputSchema } from "@/lib/return-validation";
import { lineAmounts, roundPurchaseQuantity } from "@/lib/purchase-service";
import type { z } from "zod";

export type SaleReturnInput = z.infer<typeof saleReturnInputSchema>;
export type PurchaseReturnInput = z.infer<typeof purchaseReturnInputSchema>;
export type ReturnReversalInput = z.infer<typeof returnReversalInputSchema>;

const maximumAmount = new Prisma.Decimal("999999999999.99");

function baseQuantityForPurchaseReturn(
  returnedPurchaseQuantity: Prisma.Decimal,
  originalPurchaseQuantity: Prisma.Decimal,
  receivedBaseQuantity: Prisma.Decimal,
  precision: number,
  roundingMode: "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP",
) {
  if (!returnedPurchaseQuantity.greaterThan(0)) return new Prisma.Decimal(0);
  if (returnedPurchaseQuantity.greaterThanOrEqualTo(originalPurchaseQuantity)) return receivedBaseQuantity;
  return roundPurchaseQuantity(
    receivedBaseQuantity.mul(returnedPurchaseQuantity).div(originalPurchaseQuantity),
    precision,
    roundingMode,
  );
}

export type ReturnResult =
  | { kind: "created" | "replayed"; id: string; number: string }
  | {
      kind: "error";
      error:
        | "TARGET_NOT_AVAILABLE"
        | "RETURN_NOT_AVAILABLE"
        | "LOCATION_NOT_AVAILABLE"
        | "LINE_NOT_AVAILABLE"
        | "OVER_RETURN"
        | "INVALID_QUANTITY"
        | "AMOUNT_LIMIT_EXCEEDED"
        | "INSUFFICIENT_STOCK"
        | "IDEMPOTENCY_CONFLICT"
        | "ALREADY_REVERSED";
    };

export type ReturnReversalResult =
  | { kind: "reversed" | "replayed"; id: string }
  | { kind: "error"; error: "TARGET_NOT_AVAILABLE" | "RETURN_NOT_AVAILABLE" | "INSUFFICIENT_STOCK" | "IDEMPOTENCY_CONFLICT" | "ALREADY_REVERSED" };

type StockLine = {
  productId: string;
  variantId: string | null;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
};

async function applyStockDelta(
  tx: Prisma.TransactionClient,
  movementId: string,
  businessUnitId: string,
  locationId: string,
  line: StockLine,
  direction: "IN" | "OUT",
) {
  const delta = direction === "IN" ? line.quantity : line.quantity.negated();
  const where = {
    businessUnitId,
    locationId,
    productId: line.productId,
    variantId: line.variantId,
    stockKind: "STANDARD" as const,
  };
  const balance = await tx.stockBalance.findFirst({ where });
  const currentQuantity = balance?.quantity ?? new Prisma.Decimal(0);
  const newQuantity = currentQuantity.plus(delta);
  if (newQuantity.isNegative()) return false;
  const ledgerUnitCost = direction === "OUT"
    ? balance?.averageCost ?? new Prisma.Decimal(0)
    : line.unitCost;
  const newAverageCost = direction === "IN"
    ? (balance && newQuantity.isPositive()
      ? currentQuantity.mul(balance.averageCost).plus(delta.mul(ledgerUnitCost)).div(newQuantity)
      : ledgerUnitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
    : balance?.averageCost ?? new Prisma.Decimal(0);

  await tx.stockLedgerEntry.create({
    data: {
      businessUnitId,
      movementId,
      productId: line.productId,
      variantId: line.variantId,
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
    await tx.stockBalance.create({ data: { ...where, quantity: newQuantity, averageCost: newAverageCost } });
  }
  return true;
}

async function lockLocation(tx: Prisma.TransactionClient, businessUnitId: string, locationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${locationId}::uuid
      AND "businessUnitId" = ${businessUnitId}::uuid
      AND "isActive" = true
    FOR UPDATE
  `;
  return rows.length > 0;
}

async function lockExistingLocation(tx: Prisma.TransactionClient, businessUnitId: string, locationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${locationId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  return rows.length > 0;
}

function sameSaleReturnRequest(
  existing: { saleId: string; locationId: string; reason: string; lines: Array<{ saleLineId: string; quantity: Prisma.Decimal; disposition: "RESTOCK" | "DAMAGED" }> },
  saleId: string,
  input: SaleReturnInput,
) {
  if (existing.saleId !== saleId || existing.locationId !== input.locationId || existing.reason !== input.reason || existing.lines.length !== input.lines.length) return false;
  const lines = new Map(existing.lines.map((line) => [line.saleLineId, line]));
  return input.lines.every((line) => {
    const saved = lines.get(line.saleLineId);
    return saved?.quantity.equals(line.quantity) && saved.disposition === line.disposition;
  });
}

function samePurchaseReturnRequest(
  existing: { purchaseReceiptId: string; locationId: string; reason: string; lines: Array<{ receiptLineId: string; purchaseQuantity: Prisma.Decimal }> },
  receiptId: string,
  input: PurchaseReturnInput,
) {
  if (existing.purchaseReceiptId !== receiptId || existing.locationId !== input.locationId || existing.reason !== input.reason || existing.lines.length !== input.lines.length) return false;
  const lines = new Map(existing.lines.map((line) => [line.receiptLineId, line]));
  return input.lines.every((line) => lines.get(line.receiptLineId)?.purchaseQuantity.equals(line.purchaseQuantity));
}

export async function createSaleReturn(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  businessUnitCode: string,
  actorId: string,
  saleId: string,
  input: SaleReturnInput,
): Promise<ReturnResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Sale"
    WHERE "id" = ${saleId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const sale = await tx.sale.findFirst({
    where: { id: saleId, businessUnitId },
    select: {
      invoiceNumber: true,
      taxMode: true,
      lines: {
        select: {
          id: true, productId: true, variantId: true, productName: true, sku: true,
          baseUnit: true, productType: true, variantCode: true, variantAttributes: true, quantity: true,
          unitPrice: true, gstPercentage: true, unitCost: true,
        },
      },
    },
  });
  if (!sale) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const existing = await tx.saleReturn.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true },
  });
  if (existing) {
    return sameSaleReturnRequest(existing, saleId, input)
      ? { kind: "replayed", id: existing.id, number: existing.creditNoteNumber }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }
  if (!await lockLocation(tx, businessUnitId, input.locationId)) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const savedLines = new Map(sale.lines.map((line) => [line.id, line]));
  const previouslyReturned = await tx.saleReturnLine.findMany({
    where: { businessUnitId, saleId, saleReturn: { reversedAt: null } },
    select: { saleLineId: true, quantity: true },
  });
  const returnedByLine = new Map<string, Prisma.Decimal>();
  for (const line of previouslyReturned) {
    returnedByLine.set(line.saleLineId, (returnedByLine.get(line.saleLineId) ?? new Prisma.Decimal(0)).plus(line.quantity));
  }

  const prepared: Array<{
    line: (typeof sale.lines)[number];
    quantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    cost: Prisma.Decimal;
    disposition: "RESTOCK" | "DAMAGED";
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  let cost = new Prisma.Decimal(0);
  for (const inputLine of input.lines) {
    const line = savedLines.get(inputLine.saleLineId);
    if (!line) return { kind: "error", error: "LINE_NOT_AVAILABLE" };
    const quantity = new Prisma.Decimal(inputLine.quantity);
    if (!quantity.isPositive() || (line.productType === "STANDARD" && !quantity.isInteger())) {
      return { kind: "error", error: "INVALID_QUANTITY" };
    }
    if (returnedByLine.get(line.id)?.plus(quantity).greaterThan(line.quantity)) {
      return { kind: "error", error: "OVER_RETURN" };
    }
    const lineSubtotal = line.unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineTax = sale.taxMode === "GST"
      ? lineSubtotal.mul(line.gstPercentage).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);
    const lineTotal = lineSubtotal.plus(lineTax);
    const lineCost = line.unitCost.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if ([lineSubtotal, lineTax, lineTotal, lineCost].some((amount) => amount.greaterThan(maximumAmount))) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
    prepared.push({ line, quantity, subtotal: lineSubtotal, tax: lineTax, total: lineTotal, cost: lineCost, disposition: inputLine.disposition });
    subtotal = subtotal.plus(lineSubtotal);
    taxAmount = taxAmount.plus(lineTax);
    total = total.plus(lineTotal);
    cost = cost.plus(lineCost);
  }
  if ([subtotal, taxAmount, total, cost].some((amount) => amount.greaterThan(maximumAmount))) {
    return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
  }

  const unit = await tx.businessUnit.update({
    where: { id: businessUnitId },
    data: { nextSalesCreditNoteNo: { increment: 1 } },
    select: { nextSalesCreditNoteNo: true },
  });
  const creditNoteNumber = `${businessUnitCode}-CN-${String(unit.nextSalesCreditNoteNo - 1).padStart(6, "0")}`;
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId,
      type: "SALE_RETURN",
      actorId,
      destinationLocationId: input.locationId,
      reference: creditNoteNumber,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    },
  });
  for (const item of prepared) {
    if (item.disposition === "RESTOCK" && !await applyStockDelta(tx, movement.id, businessUnitId, input.locationId, {
      productId: item.line.productId,
      variantId: item.line.variantId,
      quantity: item.quantity,
      unitCost: item.line.unitCost,
    }, "IN")) return { kind: "error", error: "INSUFFICIENT_STOCK" };
  }
  const record = await tx.saleReturn.create({
    data: {
      businessUnitId, saleId, stockMovementId: movement.id, locationId: input.locationId,
      creditNoteNumber, idempotencyKey: input.idempotencyKey, reason: input.reason,
      subtotal, taxAmount, total, createdBy: actorId,
      lines: {
        create: prepared.map((item, index) => ({
          saleLineId: item.line.id,
          lineNumber: index + 1,
          productId: item.line.productId,
          variantId: item.line.variantId,
          productName: item.line.productName,
          sku: item.line.sku,
          baseUnit: item.line.baseUnit,
          variantCode: item.line.variantCode,
          variantAttributes: item.line.variantAttributes ?? Prisma.DbNull,
          quantity: item.quantity,
          disposition: item.disposition,
          unitPrice: item.line.unitPrice,
          gstPercentage: item.line.gstPercentage,
          lineSubtotal: item.subtotal,
          lineTax: item.tax,
          lineTotal: item.total,
          unitCost: item.line.unitCost,
          lineCost: item.cost,
        })),
      },
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "CREATE", entity: "SaleReturn", entityId: record.id,
      details: { creditNoteNumber, invoiceNumber: sale.invoiceNumber, total: total.toString(), lineCount: prepared.length },
    },
  });
  return { kind: "created", id: record.id, number: creditNoteNumber };
}

export async function createPurchaseReturn(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  businessUnitCode: string,
  actorId: string,
  receiptId: string,
  input: PurchaseReturnInput,
): Promise<ReturnResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseReceipt"
    WHERE "id" = ${receiptId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const receipt = await tx.purchaseReceipt.findFirst({
    where: { id: receiptId, businessUnitId },
    select: {
      supplierInvoiceNumber: true, taxMode: true,
      lines: {
        select: {
          id: true, productId: true, variantId: true, productName: true, sku: true,
          baseUnit: true, variantCode: true, variantAttributes: true,
          purchaseQuantity: true, purchaseUnit: true, conversionFactor: true,
          conversionPrecision: true, roundingMode: true, quantity: true,
          unitCost: true, purchaseUnitCost: true, gstPercentage: true,
        },
      },
    },
  });
  if (!receipt) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };
  const existing = await tx.purchaseReturn.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true },
  });
  if (existing) {
    return samePurchaseReturnRequest(existing, receiptId, input)
      ? { kind: "replayed", id: existing.id, number: existing.debitNoteNumber }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }
  if (!await lockLocation(tx, businessUnitId, input.locationId)) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const savedLines = new Map(receipt.lines.map((line) => [line.id, line]));
  const priorLines = await tx.purchaseReturnLine.findMany({
    where: { businessUnitId, purchaseReceiptId: receiptId, purchaseReturn: { reversedAt: null } },
    select: { receiptLineId: true, purchaseQuantity: true },
  });
  const returnedByLine = new Map<string, Prisma.Decimal>();
  for (const line of priorLines) {
    returnedByLine.set(line.receiptLineId, (returnedByLine.get(line.receiptLineId) ?? new Prisma.Decimal(0)).plus(line.purchaseQuantity));
  }

  const prepared: Array<{
    line: (typeof receipt.lines)[number];
    purchaseQuantity: Prisma.Decimal;
    quantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    stockUnitCost: Prisma.Decimal;
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  const requestedByStockKey = new Map<string, Prisma.Decimal>();
  for (const inputLine of input.lines) {
    const line = savedLines.get(inputLine.receiptLineId);
    if (!line) return { kind: "error", error: "LINE_NOT_AVAILABLE" };
    const purchaseQuantity = new Prisma.Decimal(inputLine.purchaseQuantity);
    if (returnedByLine.get(line.id)?.plus(purchaseQuantity).greaterThan(line.purchaseQuantity)) {
      return { kind: "error", error: "OVER_RETURN" };
    }
    const alreadyReturned = returnedByLine.get(line.id) ?? new Prisma.Decimal(0);
    const previousBaseQuantity = baseQuantityForPurchaseReturn(
      alreadyReturned, line.purchaseQuantity, line.quantity, line.conversionPrecision, line.roundingMode,
    );
    const cumulativeBaseQuantity = baseQuantityForPurchaseReturn(
      alreadyReturned.plus(purchaseQuantity), line.purchaseQuantity, line.quantity, line.conversionPrecision, line.roundingMode,
    );
    const quantity = cumulativeBaseQuantity.minus(previousBaseQuantity);
    const amounts = lineAmounts(purchaseQuantity, line.purchaseUnitCost, line.gstPercentage, receipt.taxMode);
    if ([amounts.subtotal, amounts.tax, amounts.total].some((amount) => amount.greaterThan(maximumAmount))) {
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    }
    const balance = await tx.stockBalance.findFirst({
      where: { businessUnitId, locationId: input.locationId, productId: line.productId, variantId: line.variantId, stockKind: "STANDARD" },
      select: { quantity: true, averageCost: true },
    });
    const stockKey = `${line.productId}:${line.variantId || ""}`;
    if (quantity.greaterThan(0)) {
      const requested = (requestedByStockKey.get(stockKey) ?? new Prisma.Decimal(0)).plus(quantity);
      requestedByStockKey.set(stockKey, requested);
      if (!balance || balance.quantity.lessThan(requested)) return { kind: "error", error: "INSUFFICIENT_STOCK" };
    }
    prepared.push({
      line, purchaseQuantity, quantity, subtotal: amounts.subtotal, tax: amounts.tax,
      total: amounts.total, stockUnitCost: balance?.averageCost ?? line.unitCost,
    });
    subtotal = subtotal.plus(amounts.subtotal);
    taxAmount = taxAmount.plus(amounts.tax);
    total = total.plus(amounts.total);
  }
  if ([subtotal, taxAmount, total].some((amount) => amount.greaterThan(maximumAmount))) {
    return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
  }

  const unit = await tx.businessUnit.update({
    where: { id: businessUnitId },
    data: { nextPurchaseDebitNoteNo: { increment: 1 } },
    select: { nextPurchaseDebitNoteNo: true },
  });
  const debitNoteNumber = `${businessUnitCode}-DN-${String(unit.nextPurchaseDebitNoteNo - 1).padStart(6, "0")}`;
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId, type: "PURCHASE_RETURN", actorId, sourceLocationId: input.locationId,
      reference: debitNoteNumber, idempotencyKey: input.idempotencyKey, reason: input.reason,
    },
  });
  for (const item of prepared) {
    if (item.quantity.greaterThan(0) && !await applyStockDelta(tx, movement.id, businessUnitId, input.locationId, {
      productId: item.line.productId,
      variantId: item.line.variantId,
      quantity: item.quantity,
      unitCost: item.stockUnitCost,
    }, "OUT")) return { kind: "error", error: "INSUFFICIENT_STOCK" };
  }
  const record = await tx.purchaseReturn.create({
    data: {
      businessUnitId, purchaseReceiptId: receiptId, stockMovementId: movement.id, locationId: input.locationId,
      debitNoteNumber, idempotencyKey: input.idempotencyKey, reason: input.reason,
      subtotal, taxAmount, total, createdBy: actorId,
      lines: {
        create: prepared.map((item, index) => ({
          receiptLineId: item.line.id,
          lineNumber: index + 1,
          productId: item.line.productId,
          variantId: item.line.variantId,
          productName: item.line.productName,
          sku: item.line.sku,
          baseUnit: item.line.baseUnit,
          variantCode: item.line.variantCode,
          variantAttributes: item.line.variantAttributes ?? Prisma.DbNull,
          purchaseQuantity: item.purchaseQuantity,
          purchaseUnit: item.line.purchaseUnit,
          conversionFactor: item.line.conversionFactor,
          conversionPrecision: item.line.conversionPrecision,
          roundingMode: item.line.roundingMode,
          quantity: item.quantity,
          unitCost: item.line.unitCost,
          purchaseUnitCost: item.line.purchaseUnitCost,
          stockUnitCost: item.stockUnitCost,
          gstPercentage: item.line.gstPercentage,
          lineSubtotal: item.subtotal,
          lineTax: item.tax,
          lineTotal: item.total,
        })),
      },
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "CREATE", entity: "PurchaseReturn", entityId: record.id,
      details: { debitNoteNumber, supplierInvoiceNumber: receipt.supplierInvoiceNumber, total: total.toString(), lineCount: prepared.length },
    },
  });
  return { kind: "created", id: record.id, number: debitNoteNumber };
}

export async function reverseSaleReturn(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  saleId: string,
  returnId: string,
  input: ReturnReversalInput,
): Promise<ReturnReversalResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Sale"
    WHERE "id" = ${saleId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };
  const keyMatch = await tx.saleReturn.findUnique({
    where: { businessUnitId_reversalIdempotencyKey: { businessUnitId, reversalIdempotencyKey: input.idempotencyKey } },
    select: { id: true, reversalReason: true },
  });
  if (keyMatch) {
    return keyMatch.id === returnId && keyMatch.reversalReason === input.reason
      ? { kind: "replayed", id: returnId }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }
  const record = await tx.saleReturn.findFirst({
    where: { id: returnId, businessUnitId, saleId },
    include: { lines: true },
  });
  if (!record) return { kind: "error", error: "RETURN_NOT_AVAILABLE" };
  if (record.reversedAt) return { kind: "error", error: "ALREADY_REVERSED" };
  if (!await lockExistingLocation(tx, businessUnitId, record.locationId)) return { kind: "error", error: "RETURN_NOT_AVAILABLE" };

  const restockLines = record.lines.filter((line) => line.disposition === "RESTOCK");
  const requestedByStockKey = new Map<string, Prisma.Decimal>();
  for (const line of restockLines) {
    const key = `${line.productId}:${line.variantId || ""}`;
    requestedByStockKey.set(key, (requestedByStockKey.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
  }
  for (const [key, quantity] of requestedByStockKey) {
    const [productId, variantId] = key.split(":");
    const balance = await tx.stockBalance.findFirst({
      where: { businessUnitId, locationId: record.locationId, productId, variantId: variantId || null, stockKind: "STANDARD" },
      select: { quantity: true },
    });
    if (!balance || balance.quantity.lessThan(quantity)) return { kind: "error", error: "INSUFFICIENT_STOCK" };
  }

  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId, type: "SALE_RETURN_REVERSAL", actorId,
      sourceLocationId: record.locationId, reference: `${record.creditNoteNumber}-REV`,
      idempotencyKey: `${input.idempotencyKey}:sale-return-reversal`, reason: input.reason,
    },
  });
  for (const line of restockLines) {
    await applyStockDelta(tx, movement.id, businessUnitId, record.locationId, {
      productId: line.productId, variantId: line.variantId, quantity: line.quantity, unitCost: line.unitCost,
    }, "OUT");
  }
  await tx.saleReturn.update({
    where: { id: record.id },
    data: {
      reversalMovementId: movement.id, reversalIdempotencyKey: input.idempotencyKey,
      reversedBy: actorId, reversedAt: new Date(), reversalReason: input.reason,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "REVERSE", entity: "SaleReturn", entityId: record.id,
      details: { creditNoteNumber: record.creditNoteNumber, reason: input.reason, total: record.total.toString() },
    },
  });
  return { kind: "reversed", id: record.id };
}

export async function reversePurchaseReturn(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  receiptId: string,
  returnId: string,
  input: ReturnReversalInput,
): Promise<ReturnReversalResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseReceipt"
    WHERE "id" = ${receiptId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };
  const keyMatch = await tx.purchaseReturn.findUnique({
    where: { businessUnitId_reversalIdempotencyKey: { businessUnitId, reversalIdempotencyKey: input.idempotencyKey } },
    select: { id: true, reversalReason: true },
  });
  if (keyMatch) {
    return keyMatch.id === returnId && keyMatch.reversalReason === input.reason
      ? { kind: "replayed", id: returnId }
      : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }
  const record = await tx.purchaseReturn.findFirst({
    where: { id: returnId, businessUnitId, purchaseReceiptId: receiptId },
    include: { lines: { include: { receiptLine: true } } },
  });
  if (!record) return { kind: "error", error: "RETURN_NOT_AVAILABLE" };
  if (record.reversedAt) return { kind: "error", error: "ALREADY_REVERSED" };
  if (!await lockExistingLocation(tx, businessUnitId, record.locationId)) return { kind: "error", error: "RETURN_NOT_AVAILABLE" };

  const activeLines = await tx.purchaseReturnLine.findMany({
    where: {
      businessUnitId,
      receiptLineId: { in: record.lines.map((line) => line.receiptLineId) },
      purchaseReturn: { reversedAt: null },
    },
    select: { receiptLineId: true, purchaseQuantity: true },
  });
  const activePurchaseQuantityByReceiptLine = new Map<string, Prisma.Decimal>();
  for (const line of activeLines) {
    activePurchaseQuantityByReceiptLine.set(
      line.receiptLineId,
      (activePurchaseQuantityByReceiptLine.get(line.receiptLineId) ?? new Prisma.Decimal(0)).plus(line.purchaseQuantity),
    );
  }
  const stockLines = record.lines.flatMap((line): StockLine[] => {
    const returnedPurchaseQuantity = activePurchaseQuantityByReceiptLine.get(line.receiptLineId) ?? new Prisma.Decimal(0);
    const remainingPurchaseQuantity = returnedPurchaseQuantity.minus(line.purchaseQuantity);
    const before = baseQuantityForPurchaseReturn(
      returnedPurchaseQuantity, line.receiptLine.purchaseQuantity, line.receiptLine.quantity,
      line.conversionPrecision, line.roundingMode,
    );
    const after = baseQuantityForPurchaseReturn(
      remainingPurchaseQuantity, line.receiptLine.purchaseQuantity, line.receiptLine.quantity,
      line.conversionPrecision, line.roundingMode,
    );
    const quantity = before.minus(after);
    return quantity.greaterThan(0)
      ? [{ productId: line.productId, variantId: line.variantId, quantity, unitCost: line.stockUnitCost }]
      : [];
  });
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId, type: "PURCHASE_RETURN_REVERSAL", actorId,
      destinationLocationId: record.locationId, reference: `${record.debitNoteNumber}-REV`,
      idempotencyKey: `${input.idempotencyKey}:purchase-return-reversal`, reason: input.reason,
    },
  });
  for (const line of stockLines) {
    await applyStockDelta(tx, movement.id, businessUnitId, record.locationId, {
      productId: line.productId, variantId: line.variantId, quantity: line.quantity, unitCost: line.unitCost,
    }, "IN");
  }
  await tx.purchaseReturn.update({
    where: { id: record.id },
    data: {
      reversalMovementId: movement.id, reversalIdempotencyKey: input.idempotencyKey,
      reversedBy: actorId, reversedAt: new Date(), reversalReason: input.reason,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "REVERSE", entity: "PurchaseReturn", entityId: record.id,
      details: { debitNoteNumber: record.debitNoteNumber, reason: input.reason, total: record.total.toString() },
    },
  });
  return { kind: "reversed", id: record.id };
}
