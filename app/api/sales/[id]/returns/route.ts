import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import { createSaleReturn } from "@/lib/return-service";
import { saleReturnInputSchema } from "@/lib/return-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid invoice identifier." }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const sale = await prisma.sale.findFirst({
    where: { id, businessUnitId },
    select: {
      total: true,
      taxMode: true,
      stockMovement: { select: { sourceLocationId: true } },
      lines: {
        select: {
          id: true, productName: true, sku: true, baseUnit: true, productType: true, quantity: true,
          unitPrice: true, variantCode: true, variantAttributes: true,
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!sale) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const [returns, payments, locations, sourceAllocations] = await Promise.all([
    prisma.saleReturn.findMany({
      where: { businessUnitId, saleId: id },
      include: {
        lines: { orderBy: { lineNumber: "asc" }, include: { sourceAllocation: { include: { remnant: { select: { code: true } } } } } },
        creator: { select: { name: true } },
        reverser: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { businessUnitId, saleId: id, reversedAt: null },
      select: { amount: true },
    }),
    prisma.stockLocation.findMany({
      where: { businessUnitId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.saleLineStockAllocation.findMany({
      where: { businessUnitId, saleLine: { saleId: id } },
      include: {
        stockBalance: { select: { locationId: true, location: { select: { name: true } } } },
        remnant: { select: { code: true, locationId: true, location: { select: { name: true } }, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const returnedAmount = returns.reduce((sum, item) => item.reversedAt ? sum : sum.plus(item.total), new Prisma.Decimal(0));
  const paidAmount = payments.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const netBalance = sale.total.minus(returnedAmount).minus(paidAmount);
  const returnedByLine = new Map<string, Prisma.Decimal>();
  const returnedByAllocation = new Map<string, Prisma.Decimal>();
  for (const item of returns) {
    if (item.reversedAt) continue;
    for (const line of item.lines) {
      returnedByLine.set(line.saleLineId, (returnedByLine.get(line.saleLineId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      if (line.sourceAllocationId && line.allocationQuantity) returnedByAllocation.set(
        line.sourceAllocationId,
        (returnedByAllocation.get(line.sourceAllocationId) ?? new Prisma.Decimal(0)).plus(line.allocationQuantity),
      );
    }
  }
  return NextResponse.json({
    total: sale.total.toString(),
    returnedAmount: returnedAmount.toString(),
    paidAmount: paidAmount.toString(),
    balanceDue: netBalance.greaterThan(0) ? netBalance.toString() : "0",
    creditBalance: netBalance.isNegative() ? netBalance.abs().toString() : "0",
    defaultLocationId: sale.stockMovement.sourceLocationId,
    locations,
    lines: sale.lines.map((line) => ({
      id: line.id,
      productName: line.productName,
      sku: line.sku,
      unit: line.baseUnit,
      productType: line.productType,
      quantity: line.quantity.toString(),
      returnedQuantity: (returnedByLine.get(line.id) ?? new Prisma.Decimal(0)).toString(),
      availableQuantity: line.quantity.minus(returnedByLine.get(line.id) ?? new Prisma.Decimal(0)).toString(),
      allocations: sourceAllocations.filter((allocation) => allocation.saleLineId === line.id).map((allocation) => {
        const returned = returnedByAllocation.get(allocation.id) ?? new Prisma.Decimal(0);
        const sourceLocationId = allocation.sourceType === "STANDARD" ? allocation.stockBalance?.locationId : allocation.remnant?.locationId;
        return {
          id: allocation.id,
          sourceType: allocation.sourceType,
          sourceCode: allocation.remnant?.code ?? (allocation.sourceType === "STANDARD" ? "Standard stock" : "Remnant"),
          unit: allocation.unit,
          quantity: allocation.quantity.toString(),
          returnedQuantity: returned.toString(),
          availableQuantity: allocation.quantity.minus(returned).toString(),
          locationId: sourceLocationId ?? null,
          locationName: allocation.sourceType === "STANDARD" ? allocation.stockBalance?.location.name : allocation.remnant?.location.name,
          remnantStatus: allocation.remnant?.status ?? null,
        };
      }),
      unitPrice: line.unitPrice.toString(),
      variantCode: line.variantCode,
      variantAttributes: line.variantAttributes,
    })),
    returns: returns.map((item) => ({
      id: item.id,
      number: item.creditNoteNumber,
      reason: item.reason,
      locationName: item.location.name,
      subtotal: item.subtotal.toString(),
      taxAmount: item.taxAmount.toString(),
      total: item.total.toString(),
      createdAt: item.createdAt.toISOString(),
      createdBy: item.creator.name,
      reversedAt: item.reversedAt?.toISOString() ?? null,
      reversalReason: item.reversalReason,
      reversedBy: item.reverser?.name ?? null,
      lines: item.lines.map((line) => ({
        id: line.id,
        productName: line.productName,
        sku: line.sku,
        unit: line.baseUnit,
        quantity: line.quantity.toString(),
        disposition: line.disposition,
        sourceType: line.sourceType,
        sourceCode: line.sourceType === "REMNANT" ? line.sourceAllocation?.remnant?.code ?? "Remnant" : line.sourceType === "STANDARD" ? "Standard stock" : null,
        allocationQuantity: line.allocationQuantity?.toString() ?? null,
        allocationUnit: line.allocationUnit,
        lineTotal: line.lineTotal.toString(),
      })),
    })),
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("billing.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid invoice identifier." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = saleReturnInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid sales return.", details: parsed.error.flatten() }, { status: 400 });

  let result: Awaited<ReturnType<typeof createSaleReturn>>;
  try {
    result = await prisma.$transaction((tx) =>
      createSaleReturn(tx, access.context.businessUnit.id, access.context.businessUnit.code, access.context.session.user.id, id, parsed.data),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This return request was already recorded." }, { status: 409 });
    }
    throw error;
  }
  if (result.kind === "error") {
    const status = result.error === "TARGET_NOT_AVAILABLE" ? 404 : result.error === "LINE_NOT_AVAILABLE" ? 400 : 409;
    const messages = {
      TARGET_NOT_AVAILABLE: "Invoice not found.",
      RETURN_NOT_AVAILABLE: "Return not found.",
      LOCATION_NOT_AVAILABLE: "Select an active stock location.",
      LINE_NOT_AVAILABLE: "One or more invoice lines or original stock allocations are unavailable.",
      SOURCE_ALLOCATION_MISMATCH: "This invoice line has an earlier return without source-allocation details. Reconcile that return before posting another source-specific return.",
      SOURCE_NOT_RESTORABLE: "The original remnant has been consumed or changed and cannot be safely restored. Mark it damaged or reconcile the source first.",
      SOURCE_ALLOCATION_MISMATCH: "This invoice line has an earlier return without source-allocation details. Reconcile that return before posting another source-specific return.",
      SOURCE_NOT_RESTORABLE: "The original remnant has been consumed or changed and cannot be safely restored. Mark it damaged or reconcile the source first.",
      OVER_RETURN: "Return quantity exceeds the unreturned invoice quantity.",
      INVALID_QUANTITY: "Return quantity must be positive and cannot exceed the remaining quantity of the selected original allocation.",
      AMOUNT_LIMIT_EXCEEDED: "Return amount exceeds the supported limit.",
      INSUFFICIENT_STOCK: "Insufficient stock to complete this return.",
      IDEMPOTENCY_CONFLICT: "This request key was already used for a different return.",
      ALREADY_REVERSED: "This return has already been reversed.",
    };
    return NextResponse.json({ error: messages[result.error] }, { status });
  }
  return NextResponse.json(
    { id: result.id, number: result.number, replayed: result.kind === "replayed" },
    { status: result.kind === "replayed" ? 200 : 201 },
  );
}
