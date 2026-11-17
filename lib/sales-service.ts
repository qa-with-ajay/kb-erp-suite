import { Prisma } from "@prisma/client";
import type { saleInputSchema } from "@/lib/sales-validation";
import type { z } from "zod";

export type SaleInput = z.infer<typeof saleInputSchema>;

type MovementWithSale = Prisma.StockMovementGetPayload<{
  include: { sale: { include: { lines: true } } };
}>;

export type SaleResult =
  | { kind: "created" | "replayed"; saleId: string; invoiceNumber: string }
  | {
      kind: "error";
      error:
        | "IDEMPOTENCY_CONFLICT"
        | "LOCATION_NOT_AVAILABLE"
        | "CUSTOMER_NOT_AVAILABLE"
        | "PRODUCT_NOT_AVAILABLE"
        | "VARIANT_REQUIRED"
        | "VARIANT_NOT_AVAILABLE"
        | "PANEL_UNIT_MUST_BE_PCS"
        | "AMOUNT_LIMIT_EXCEEDED"
        | "INSUFFICIENT_STOCK";
      productName?: string;
    };

function lineKey(line: { productId: string; variantId?: string | null }) {
  return `${line.productId}:${line.variantId || ""}`;
}

export function isSameSaleRequest(existing: MovementWithSale, input: SaleInput, businessUnitId: string) {
  const sale = existing.sale;
  if (
    existing.type !== "SALE" ||
    existing.businessUnitId !== businessUnitId ||
    existing.sourceLocationId !== input.locationId ||
    existing.destinationLocationId !== null ||
    !sale ||
    sale.taxMode !== input.taxMode ||
    sale.customerId !== (input.customerId || null) ||
    (!input.customerId && (
      sale.customerName !== (input.customerName || null) ||
      sale.customerPhone !== (input.customerPhone || null)
    )) ||
    sale.lines.length !== input.lines.length
  ) return false;

  const savedLines = new Map(sale.lines.map((line) => [lineKey(line), line]));
  return input.lines.every((line) => {
    const saved = savedLines.get(lineKey(line));
    return saved !== undefined &&
      saved.variantId === (line.variantId || null) &&
      saved.quantity.equals(line.quantity);
  });
}

export async function createSale(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  input: SaleInput,
): Promise<SaleResult> {
  const prior = await tx.stockMovement.findUnique({
    where: {
      businessUnitId_idempotencyKey: {
        businessUnitId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { sale: { include: { lines: true } } },
  });
  if (prior) {
    if (isSameSaleRequest(prior, input, businessUnitId) && prior.sale) {
      return { kind: "replayed", saleId: prior.sale.id, invoiceNumber: prior.sale.invoiceNumber };
    }
    return { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }

  const customer = input.customerId
    ? await tx.customer.findFirst({
      where: { id: input.customerId, businessUnitId, isActive: true },
      select: { id: true, name: true, phone: true },
    })
    : null;
  if (input.customerId && !customer) return { kind: "error", error: "CUSTOMER_NOT_AVAILABLE" };

  const locationRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${input.locationId}::uuid
      AND "businessUnitId" = ${businessUnitId}::uuid
      AND "isActive" = true
    FOR UPDATE
  `;
  if (!locationRows.length) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const products = await tx.product.findMany({
    where: { businessUnitId, id: { in: productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      baseUnit: true,
      productType: true,
      sellingPrice: true,
      gstPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, code: true, attributes: true } },
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const preparedLines: Array<{
    product: (typeof products)[number];
    variant: (typeof products)[number]["variants"][number] | null;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    gstPercentage: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    cost: Prisma.Decimal;
  }> = [];
  let subtotal = new Prisma.Decimal(0);
  let taxAmount = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  let costOfGoods = new Prisma.Decimal(0);
  const maximumAmount = new Prisma.Decimal("999999999999.99");

  for (const line of input.lines) {
    const product = productById.get(line.productId);
    if (!product) return { kind: "error", error: "PRODUCT_NOT_AVAILABLE" };
    if (product.productType === "PANEL" && product.baseUnit !== "PCS") {
      return { kind: "error", error: "PANEL_UNIT_MUST_BE_PCS", productName: product.name };
    }
    if (product.variants.length && !line.variantId) {
      return { kind: "error", error: "VARIANT_REQUIRED", productName: product.name };
    }
    const variant = line.variantId
      ? product.variants.find((candidate) => candidate.id === line.variantId)
      : null;
    if (line.variantId && !variant) {
      return { kind: "error", error: "VARIANT_NOT_AVAILABLE", productName: product.name };
    }

    const quantity = new Prisma.Decimal(line.quantity);
    const balance = await tx.stockBalance.findFirst({
      where: {
        businessUnitId,
        locationId: input.locationId,
        productId: product.id,
        variantId: line.variantId || null,
        stockKind: "STANDARD",
      },
    });
    if (!balance || balance.quantity.lessThan(quantity)) {
      return { kind: "error", error: "INSUFFICIENT_STOCK", productName: product.name };
    }

    const unitPrice = product.sellingPrice;
    const gstPercentage = product.gstPercentage;
    const lineSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineTax = input.taxMode === "GST"
      ? lineSubtotal.mul(gstPercentage).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);
    const lineTotal = lineSubtotal.plus(lineTax);
    const lineCost = balance.averageCost.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (
      lineSubtotal.greaterThan(maximumAmount) ||
      lineTax.greaterThan(maximumAmount) ||
      lineTotal.greaterThan(maximumAmount) ||
      lineCost.greaterThan(maximumAmount)
    ) return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };

    preparedLines.push({
      product,
      variant: variant ?? null,
      quantity,
      unitPrice,
      gstPercentage,
      subtotal: lineSubtotal,
      tax: lineTax,
      total: lineTotal,
      unitCost: balance.averageCost,
      cost: lineCost,
    });
    subtotal = subtotal.plus(lineSubtotal);
    taxAmount = taxAmount.plus(lineTax);
    total = total.plus(lineTotal);
    costOfGoods = costOfGoods.plus(lineCost);
    if (
      subtotal.greaterThan(maximumAmount) ||
      taxAmount.greaterThan(maximumAmount) ||
      total.greaterThan(maximumAmount) ||
      costOfGoods.greaterThan(maximumAmount)
    ) return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
  }

  const profile = await tx.businessProfile.update({
    where: { businessUnitId },
    data: { nextInvoiceNo: { increment: 1 } },
    select: { invoicePrefix: true, nextInvoiceNo: true },
  });
  const invoiceSequence = profile.nextInvoiceNo - 1;
  const invoiceNumber = `${profile.invoicePrefix}-${String(invoiceSequence).padStart(6, "0")}`;
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId,
      type: "SALE",
      actorId,
      sourceLocationId: input.locationId,
      reference: invoiceNumber,
      idempotencyKey: input.idempotencyKey,
      reason: "Full-unit invoice sale",
    },
  });
  const sale = await tx.sale.create({
    data: {
      businessUnitId,
      stockMovementId: movement.id,
      customerId: customer?.id ?? null,
      invoiceNumber,
      taxMode: input.taxMode,
      customerName: customer?.name ?? (input.customerName || null),
      customerPhone: customer?.phone ?? (input.customerPhone || null),
      subtotal,
      taxAmount,
      total,
      costOfGoods,
      createdBy: actorId,
    },
  });

  for (const [index, line] of preparedLines.entries()) {
    const balance = await tx.stockBalance.findFirstOrThrow({
      where: {
        businessUnitId,
        locationId: input.locationId,
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        stockKind: "STANDARD",
      },
    });
    const nextQuantity = balance.quantity.minus(line.quantity);
    await tx.stockLedgerEntry.create({
      data: {
        businessUnitId,
        movementId: movement.id,
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        locationId: input.locationId,
        stockKind: "STANDARD",
        quantityDelta: line.quantity.negated(),
        unitCost: line.unitCost,
      },
    });
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: nextQuantity },
    });
    await tx.saleLine.create({
      data: {
        businessUnitId,
        saleId: sale.id,
        lineNumber: index + 1,
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        productName: line.product.name,
        sku: line.product.sku,
        baseUnit: line.product.baseUnit,
        variantCode: line.variant?.code ?? null,
        variantAttributes: line.variant?.attributes ?? Prisma.DbNull,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        gstPercentage: line.gstPercentage,
        lineSubtotal: line.subtotal,
        lineTax: line.tax,
        lineTotal: line.total,
        unitCost: line.unitCost,
        lineCost: line.cost,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "Sale",
      entityId: sale.id,
      details: {
        invoiceNumber,
        taxMode: input.taxMode,
        lineCount: preparedLines.length,
        total: total.toString(),
      },
    },
  });
  return { kind: "created", saleId: sale.id, invoiceNumber };
}
