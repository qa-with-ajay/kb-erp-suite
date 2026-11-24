import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { saleInputSchema } from "@/lib/sales-validation";
import type { z } from "zod";

export type SaleInput = z.infer<typeof saleInputSchema>;
type MovementWithSale = Prisma.StockMovementGetPayload<{
  include: { sale: { include: { lines: { include: { stockAllocations: true } } } } };
}>;

type AllocationInput = NonNullable<SaleInput["lines"][number]["allocations"]>[number];

export type SaleResult =
  | { kind: "created" | "replayed"; saleId: string; invoiceNumber: string }
  | { kind: "error"; error:
      | "IDEMPOTENCY_CONFLICT" | "LOCATION_NOT_AVAILABLE" | "CUSTOMER_NOT_AVAILABLE"
      | "PRODUCT_NOT_AVAILABLE" | "VARIANT_REQUIRED" | "VARIANT_NOT_AVAILABLE"
      | "AMOUNT_LIMIT_EXCEEDED" | "INSUFFICIENT_STOCK" | "INVALID_QUANTITY"
      | "INVALID_ALLOCATION" | "REMNANT_NOT_AVAILABLE" | "UNIT_MISMATCH";
      productName?: string };

function lineKey(line: { productId: string; variantId?: string | null; saleUnit?: string | null; baseUnit?: string | null }) {
  return `${line.productId}:${line.variantId || ""}:${line.saleUnit ?? line.baseUnit ?? ""}`;
}
function normalizedAllocations(items: Array<{ sourceType: string; sourceId?: string | null; quantity: string | Prisma.Decimal }>) {
  return items.map((item) => `${item.sourceType}:${item.sourceId || ""}:${String(item.quantity)}`).sort().join("|");
}

export function isSameSaleRequest(existing: MovementWithSale, input: SaleInput, businessUnitId: string) {
  const sale = existing.sale;
  if (
    existing.type !== "SALE" || existing.businessUnitId !== businessUnitId ||
    existing.sourceLocationId !== input.locationId || existing.destinationLocationId !== null ||
    !sale || sale.taxMode !== input.taxMode || sale.customerId !== (input.customerId || null) ||
    (!input.customerId && (sale.customerName !== (input.customerName || null) ||
      sale.customerPhone !== (input.customerPhone || null))) || sale.lines.length !== input.lines.length
  ) return false;

  const savedLines = new Map(sale.lines.map((line) => [lineKey(line), line]));
  return input.lines.every((line) => {
    const saved = savedLines.get(lineKey(line));
    if (!saved || saved.variantId !== (line.variantId || null) || !saved.quantity.equals(line.quantity)) return false;
    if (line.allocations) {
      return normalizedAllocations(saved.stockAllocations.map((a) => ({
        sourceType: a.sourceType, sourceId: a.sourceType === "STANDARD" ? a.stockBalanceId : a.remnantId, quantity: a.quantity,
      }))) === normalizedAllocations(line.allocations.map((a) => ({
        sourceType: a.sourceType, sourceId: a.sourceId, quantity: a.quantity,
      })));
    }
    return true;
  });
}

export async function createSale(
  tx: Prisma.TransactionClient, businessUnitId: string, actorId: string, input: SaleInput,
): Promise<SaleResult> {
  const prior = await tx.stockMovement.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    include: { sale: { include: { lines: { include: { stockAllocations: true } } } } },
  });
  if (prior) {
    if (isSameSaleRequest(prior, input, businessUnitId) && prior.sale)
      return { kind: "replayed", saleId: prior.sale.id, invoiceNumber: prior.sale.invoiceNumber };
    return { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
  }

  const customer = input.customerId ? await tx.customer.findFirst({
    where: { id: input.customerId, businessUnitId, isActive: true },
    select: { id: true, name: true, phone: true },
  }) : null;
  if (input.customerId && !customer) return { kind: "error", error: "CUSTOMER_NOT_AVAILABLE" };

  const locationRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockLocation"
    WHERE "id" = ${input.locationId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid AND "isActive" = true
    FOR UPDATE
  `;
  if (!locationRows.length) return { kind: "error", error: "LOCATION_NOT_AVAILABLE" };

  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const products = await tx.product.findMany({
    where: { businessUnitId, id: { in: productIds }, isActive: true },
    select: {
      id: true, name: true, sku: true, baseUnit: true, materialUnit: true,
      materialUnitsPerBaseUnit: true, unitConversions: { where: { isSalesUnit: true }, select: { unit: true, conversionFactor: true } }, productType: true, sellingPrice: true, gstPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, code: true, attributes: true } },
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  type PreparedAllocation = {
    sourceType: "STANDARD" | "REMNANT"; sourceId: string; quantity: Prisma.Decimal;
    unit: typeof products[number]["baseUnit"]; factor: Prisma.Decimal; baseQuantity: Prisma.Decimal;
    unitCost: Prisma.Decimal; lineCost: Prisma.Decimal;
  };
  const preparedLines: Array<{
    product: typeof products[number]; variant: typeof products[number]["variants"][number] | null;
    quantity: Prisma.Decimal; saleUnit: typeof products[number]["baseUnit"]; createRemnant: boolean;
    unitPrice: Prisma.Decimal; gstPercentage: Prisma.Decimal; subtotal: Prisma.Decimal;
    tax: Prisma.Decimal; total: Prisma.Decimal; unitCost: Prisma.Decimal; cost: Prisma.Decimal;
    allocations: PreparedAllocation[];
  }> = [];
  let subtotal = new Prisma.Decimal(0), taxAmount = new Prisma.Decimal(0), total = new Prisma.Decimal(0), costOfGoods = new Prisma.Decimal(0);
  const maximumAmount = new Prisma.Decimal("999999999999.99");

  for (const line of input.lines) {
    const product = productById.get(line.productId);
    if (!product) return { kind: "error", error: "PRODUCT_NOT_AVAILABLE" };
    if (product.variants.length && !line.variantId) return { kind: "error", error: "VARIANT_REQUIRED", productName: product.name };
    const variant = line.variantId ? product.variants.find((candidate) => candidate.id === line.variantId) : null;
    if (line.variantId && !variant) return { kind: "error", error: "VARIANT_NOT_AVAILABLE", productName: product.name };

    const quantity = new Prisma.Decimal(line.quantity);
    if (!quantity.isPositive())
      return { kind: "error", error: "INVALID_QUANTITY", productName: product.name };

    const saleUnit = line.saleUnit ?? product.materialUnit ?? product.baseUnit;
    const materialFactor = new Prisma.Decimal(product.materialUnitsPerBaseUnit ?? 1);
    const usesMaterialUnit = Boolean(product.materialUnit && saleUnit === product.materialUnit);
    const configuredUnit = product.unitConversions.find((item) => item.unit === saleUnit);
    // Configured conversionFactor is base-stock units per one sales unit.
    const factor = saleUnit === product.baseUnit ? new Prisma.Decimal(1)
      : usesMaterialUnit ? new Prisma.Decimal(1).div(materialFactor)
      : configuredUnit ? new Prisma.Decimal(configuredUnit.conversionFactor) : null;
    if (!factor || !factor.isPositive() || (line.createRemnant && (!usesMaterialUnit || product.productType !== "MATERIAL")))
      return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
    const rawAllocations: AllocationInput[] = line.allocations ?? [];
    const allocations: PreparedAllocation[] = [];
    if (!rawAllocations.length) {
      if (product.materialUnit || saleUnit !== product.baseUnit) return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
      const balance = await tx.stockBalance.findFirst({
        where: { businessUnitId, locationId: input.locationId, productId: product.id, variantId: line.variantId || null, stockKind: "STANDARD" },
      });
      if (!balance || balance.quantity.lessThan(quantity)) return { kind: "error", error: "INSUFFICIENT_STOCK", productName: product.name };
      allocations.push({ sourceType: "STANDARD", sourceId: balance.id, quantity, unit: product.baseUnit, factor, baseQuantity: quantity, unitCost: balance.averageCost, lineCost: balance.averageCost.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) });
    } else {
      const seen = new Set<string>();
      for (const requested of rawAllocations) {
        const sourceId = requested.sourceId;
        if (!sourceId || seen.has(`${requested.sourceType}:${sourceId}`)) return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
        seen.add(`${requested.sourceType}:${sourceId}`);
        const sourceQuantity = new Prisma.Decimal(requested.quantity);
        if (!sourceQuantity.isPositive()) return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
        if (requested.sourceType === "STANDARD") {
          if (product.productType === "STANDARD" && !sourceQuantity.isInteger()) return { kind: "error", error: "INVALID_QUANTITY", productName: product.name };
          if ((product.productType === "STANDARD" || usesMaterialUnit) && !sourceQuantity.isInteger()) return { kind: "error", error: "INVALID_QUANTITY", productName: product.name };
          const balance = await tx.stockBalance.findFirst({
            where: { id: sourceId, businessUnitId, locationId: input.locationId, productId: product.id, variantId: line.variantId || null, stockKind: "STANDARD" },
          });
          if (!balance || balance.quantity.lessThan(sourceQuantity)) return { kind: "error", error: "INSUFFICIENT_STOCK", productName: product.name };
          const normalized = usesMaterialUnit
            ? sourceQuantity.mul(materialFactor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
            : sourceQuantity.div(factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
          const cost = balance.averageCost.mul(sourceQuantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          allocations.push({ sourceType: "STANDARD", sourceId, quantity: sourceQuantity, unit: product.baseUnit, factor: usesMaterialUnit ? materialFactor : new Prisma.Decimal(1).div(factor), baseQuantity: normalized, unitCost: balance.averageCost, lineCost: cost });
        } else {
          const remnant = await tx.materialRemnant.findFirst({
            where: { id: sourceId, businessUnitId, locationId: input.locationId, productId: product.id, variantId: line.variantId || null, status: "AVAILABLE" },
          });
          if (!remnant || remnant.quantity.lessThan(sourceQuantity)) return { kind: "error", error: "REMNANT_NOT_AVAILABLE", productName: product.name };
          const remnantUnit = remnant.unit ?? product.materialUnit ?? product.baseUnit;
          if (remnantUnit !== saleUnit) return { kind: "error", error: "UNIT_MISMATCH", productName: product.name };
          const remnantBalance = await tx.stockBalance.findFirst({
            where: { businessUnitId, locationId: input.locationId, productId: product.id, variantId: line.variantId || null, stockKind: "REMNANT" },
          });
          if (!remnantBalance || remnantBalance.quantity.lessThan(sourceQuantity)) return { kind: "error", error: "INSUFFICIENT_STOCK", productName: product.name };
          const remnantUnitCost = remnant.unitCost.isPositive() ? remnant.unitCost : remnantBalance.averageCost;
          allocations.push({ sourceType: "REMNANT", sourceId, quantity: sourceQuantity, unit: remnantUnit, factor: new Prisma.Decimal(1), baseQuantity: sourceQuantity, unitCost: remnantUnitCost, lineCost: remnantUnitCost.mul(sourceQuantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) });
        }
      }
    }

    const remnantAllocated = allocations.filter((item) => item.sourceType === "REMNANT").reduce((sum, item) => sum.plus(item.baseQuantity), new Prisma.Decimal(0));
    if (line.createRemnant) {
      const standard = allocations.filter((item) => item.sourceType === "STANDARD");
      const packageCount = standard.reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));
      const soldFromStandard = quantity.minus(remnantAllocated);
      const packageContents = packageCount.mul(materialFactor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      if (!packageCount.isPositive() || !soldFromStandard.isPositive() || soldFromStandard.gte(packageContents))
        return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
      let remainingSaleQty = soldFromStandard;
      for (const allocation of standard) {
        const packageSaleQty = allocation.quantity.mul(materialFactor);
        const soldQty = Prisma.Decimal.min(packageSaleQty, remainingSaleQty);
        allocation.baseQuantity = soldQty;
        allocation.lineCost = allocation.unitCost.mul(allocation.quantity).mul(soldQty).div(packageSaleQty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        remainingSaleQty = remainingSaleQty.minus(soldQty);
      }
      if (!remainingSaleQty.isZero()) return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
    }
    const allocatedQuantity = allocations.reduce((sum, item) => sum.plus(item.baseQuantity), new Prisma.Decimal(0)).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (!allocatedQuantity.equals(quantity)) return { kind: "error", error: "INVALID_ALLOCATION", productName: product.name };
    const lineCost = allocations.reduce((sum, item) => sum.plus(item.lineCost), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const unitCost = quantity.isPositive() ? lineCost.div(quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) : new Prisma.Decimal(0);
    const unitPrice = usesMaterialUnit ? product.sellingPrice.div(materialFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : saleUnit === product.baseUnit ? product.sellingPrice
      : product.sellingPrice.mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const gstPercentage = product.gstPercentage;
    const lineSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineTax = input.taxMode === "GST" ? lineSubtotal.mul(gstPercentage).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : new Prisma.Decimal(0);
    const lineTotal = lineSubtotal.plus(lineTax);
    if ([lineSubtotal, lineTax, lineTotal, lineCost].some((value) => value.abs().greaterThan(maximumAmount)))
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
    preparedLines.push({ product, variant: variant ?? null, quantity, saleUnit, createRemnant: Boolean(line.createRemnant), unitPrice, gstPercentage, subtotal: lineSubtotal, tax: lineTax, total: lineTotal, unitCost, cost: lineCost, allocations });
    subtotal = subtotal.plus(lineSubtotal); taxAmount = taxAmount.plus(lineTax); total = total.plus(lineTotal); costOfGoods = costOfGoods.plus(lineCost);
    if ([subtotal, taxAmount, total, costOfGoods].some((value) => value.abs().greaterThan(maximumAmount)))
      return { kind: "error", error: "AMOUNT_LIMIT_EXCEEDED" };
  }

  const profile = await tx.businessProfile.update({
    where: { businessUnitId }, data: { nextInvoiceNo: { increment: 1 } },
    select: { invoicePrefix: true, nextInvoiceNo: true },
  });
  const invoiceNumber = `${profile.invoicePrefix}-${String(profile.nextInvoiceNo - 1).padStart(6, "0")}`;
  const movement = await tx.stockMovement.create({
    data: { businessUnitId, type: "SALE", actorId, sourceLocationId: input.locationId, reference: invoiceNumber, idempotencyKey: input.idempotencyKey, reason: "Sale allocated from regular and/or remnant stock" },
  });
  const sale = await tx.sale.create({
    data: { businessUnitId, stockMovementId: movement.id, customerId: customer?.id ?? null, invoiceNumber, taxMode: input.taxMode,
      customerName: customer?.name ?? (input.customerName || null), customerPhone: customer?.phone ?? (input.customerPhone || null),
      subtotal, taxAmount, total, costOfGoods, createdBy: actorId },
  });

  for (const [index, line] of preparedLines.entries()) {
    const saleLine = await tx.saleLine.create({
      data: { businessUnitId, saleId: sale.id, lineNumber: index + 1, productId: line.product.id, variantId: line.variant?.id ?? null,
        productName: line.product.name, sku: line.product.sku, baseUnit: line.saleUnit, productType: line.product.productType,
        variantCode: line.variant?.code ?? null, variantAttributes: line.variant?.attributes ?? Prisma.DbNull,
        quantity: line.quantity, unitPrice: line.unitPrice, gstPercentage: line.gstPercentage,
        lineSubtotal: line.subtotal, lineTax: line.tax, lineTotal: line.total, unitCost: line.unitCost, lineCost: line.cost },
    });
    for (const allocation of line.allocations) {
      if (allocation.sourceType === "STANDARD") {
        const changed = await tx.stockBalance.updateMany({
          where: { id: allocation.sourceId, businessUnitId, stockKind: "STANDARD", quantity: { gte: allocation.quantity } },
          data: { quantity: { decrement: allocation.quantity } },
        });
        if (changed.count !== 1) throw new Error("SALE_STOCK_CHANGED");
        await tx.stockLedgerEntry.create({ data: { businessUnitId, movementId: movement.id, productId: line.product.id, variantId: line.variant?.id ?? null,
          locationId: input.locationId, stockKind: "STANDARD", quantityDelta: allocation.quantity.negated(), unitCost: allocation.unitCost } });
      } else {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Remnant" WHERE "id" = ${allocation.sourceId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid FOR UPDATE
        `;
        if (!locked.length) throw new Error("SALE_STOCK_CHANGED");
        const remnant = await tx.materialRemnant.findFirst({ where: { id: allocation.sourceId, businessUnitId, locationId: input.locationId, productId: line.product.id, status: "AVAILABLE" } });
        if (!remnant || remnant.quantity.lessThan(allocation.quantity)) throw new Error("SALE_STOCK_CHANGED");
        const remaining = remnant.quantity.minus(allocation.quantity);
        await tx.materialRemnant.update({ where: { id: remnant.id }, data: { quantity: remaining, status: remaining.isZero() ? "SOLD" : "AVAILABLE" } });
        const remnantBalance = await tx.stockBalance.findFirst({ where: { businessUnitId, locationId: input.locationId, productId: line.product.id, variantId: line.variant?.id ?? null, stockKind: "REMNANT" } });
        if (!remnantBalance || remnantBalance.quantity.lessThan(allocation.quantity)) throw new Error("SALE_STOCK_CHANGED");
        const remnantBalanceChanged = await tx.stockBalance.updateMany({
          where: { id: remnantBalance.id, businessUnitId, quantity: { gte: allocation.quantity } },
          data: { quantity: { decrement: allocation.quantity } },
        });
        if (remnantBalanceChanged.count !== 1) throw new Error("SALE_STOCK_CHANGED");
        await tx.stockLedgerEntry.create({ data: { businessUnitId, movementId: movement.id, productId: line.product.id, variantId: line.variant?.id ?? null,
          locationId: input.locationId, stockKind: "REMNANT", quantityDelta: allocation.quantity.negated(), unitCost: allocation.unitCost } });
        await tx.materialRemnantMovement.create({ data: { businessUnitId, remnantId: remnant.id, locationId: input.locationId, actorId, type: "SOLD",
          quantityDelta: allocation.quantity.negated(), reason: `Sold on invoice ${invoiceNumber}` } });
      }
      await tx.saleLineStockAllocation.create({ data: { businessUnitId, saleLineId: saleLine.id, sourceType: allocation.sourceType,
        stockBalanceId: allocation.sourceType === "STANDARD" ? allocation.sourceId : null,
        remnantId: allocation.sourceType === "REMNANT" ? allocation.sourceId : null,
        quantity: allocation.quantity, unit: allocation.unit, conversionFactor: allocation.factor,
        baseQuantity: allocation.baseQuantity, unitCost: allocation.unitCost, lineCost: allocation.lineCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) } });
    }
    if (line.createRemnant) {
      const standard = line.allocations.filter((allocation) => allocation.sourceType === "STANDARD");
      const packageCount = standard.reduce((sum, allocation) => sum.plus(allocation.quantity), new Prisma.Decimal(0));
      const remnantQuantity = packageCount.mul(new Prisma.Decimal(line.product.materialUnitsPerBaseUnit ?? 1))
        .minus(line.quantity.minus(line.allocations.filter((allocation) => allocation.sourceType === "REMNANT")
          .reduce((sum, allocation) => sum.plus(allocation.baseQuantity), new Prisma.Decimal(0))))
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const packageCost = standard.reduce((sum, allocation) => sum.plus(allocation.unitCost.mul(allocation.quantity)), new Prisma.Decimal(0));
      const soldCost = standard.reduce((sum, allocation) => sum.plus(allocation.lineCost), new Prisma.Decimal(0));
      const remnantUnitCost = packageCost.minus(soldCost).div(remnantQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const remnant = await tx.materialRemnant.create({ data: {
        businessUnitId, productId: line.product.id, variantId: line.variant?.id ?? null, locationId: input.locationId,
        code: `RM-${randomUUID().slice(0, 8).toUpperCase()}`, quantity: remnantQuantity,
        unit: line.product.materialUnit!, unitCost: remnantUnitCost, status: "AVAILABLE",
      } });
      const balance = await tx.stockBalance.findFirst({ where: { businessUnitId, locationId: input.locationId, productId: line.product.id, variantId: line.variant?.id ?? null, stockKind: "REMNANT" } });
      const oldQuantity = balance?.quantity ?? new Prisma.Decimal(0);
      const nextQuantity = oldQuantity.plus(remnantQuantity);
      const nextAverageCost = balance && nextQuantity.isPositive()
        ? oldQuantity.mul(balance.averageCost).plus(remnantQuantity.mul(remnantUnitCost)).div(nextQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
        : remnantUnitCost;
      if (balance) await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: nextQuantity, averageCost: nextAverageCost } });
      else await tx.stockBalance.create({ data: { businessUnitId, locationId: input.locationId, productId: line.product.id, variantId: line.variant?.id ?? null, stockKind: "REMNANT", quantity: remnantQuantity, averageCost: remnantUnitCost } });
      await tx.stockLedgerEntry.create({ data: { businessUnitId, movementId: movement.id, productId: line.product.id, variantId: line.variant?.id ?? null, locationId: input.locationId, stockKind: "REMNANT", quantityDelta: remnantQuantity, unitCost: remnantUnitCost } });
      await tx.materialRemnantMovement.create({ data: { businessUnitId, remnantId: remnant.id, locationId: input.locationId, actorId, type: "CREATED", quantityDelta: remnantQuantity, reason: `Created from opened package on invoice ${invoiceNumber}` } });
    }
  }

  await tx.auditLog.create({ data: { userId: actorId, businessUnitId, action: "CREATE", entity: "Sale", entityId: sale.id,
    details: { invoiceNumber, taxMode: input.taxMode, lineCount: preparedLines.length, total: total.toString(),
      allocationCount: preparedLines.reduce((sum, line) => sum + line.allocations.length, 0) } } });
  return { kind: "created", saleId: sale.id, invoiceNumber };
}
