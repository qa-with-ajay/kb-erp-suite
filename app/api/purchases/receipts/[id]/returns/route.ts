import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import { createPurchaseReturn } from "@/lib/return-service";
import { purchaseReturnInputSchema } from "@/lib/return-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid receipt identifier." }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  const receipt = await prisma.purchaseReceipt.findFirst({
    where: { id, businessUnitId },
    select: {
      total: true,
      stockMovement: { select: { destinationLocationId: true } },
      lines: {
        select: {
          id: true, productName: true, sku: true, baseUnit: true, purchaseQuantity: true,
          purchaseUnit: true, conversionFactor: true, conversionPrecision: true,
          variantCode: true, variantAttributes: true,
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!receipt) return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });

  const [returns, payments, locations] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where: { businessUnitId, purchaseReceiptId: id },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        creator: { select: { name: true } },
        reverser: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { businessUnitId, purchaseReceiptId: id, reversedAt: null },
      select: { amount: true },
    }),
    prisma.stockLocation.findMany({
      where: { businessUnitId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const returnedAmount = returns.reduce((sum, item) => item.reversedAt ? sum : sum.plus(item.total), new Prisma.Decimal(0));
  const paidAmount = payments.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const netBalance = receipt.total.minus(returnedAmount).minus(paidAmount);
  const returnedByLine = new Map<string, Prisma.Decimal>();
  for (const item of returns) {
    if (item.reversedAt) continue;
    for (const line of item.lines) {
      returnedByLine.set(line.receiptLineId, (returnedByLine.get(line.receiptLineId) ?? new Prisma.Decimal(0)).plus(line.purchaseQuantity));
    }
  }
  return NextResponse.json({
    total: receipt.total.toString(),
    returnedAmount: returnedAmount.toString(),
    paidAmount: paidAmount.toString(),
    balanceDue: netBalance.greaterThan(0) ? netBalance.toString() : "0",
    creditBalance: netBalance.isNegative() ? netBalance.abs().toString() : "0",
    defaultLocationId: receipt.stockMovement.destinationLocationId,
    locations,
    lines: receipt.lines.map((line) => {
      const returned = returnedByLine.get(line.id) ?? new Prisma.Decimal(0);
      return {
        id: line.id,
        productName: line.productName,
        sku: line.sku,
        unit: line.purchaseUnit,
        baseUnit: line.baseUnit,
        quantity: line.purchaseQuantity.toString(),
        returnedQuantity: returned.toString(),
        availableQuantity: line.purchaseQuantity.minus(returned).toString(),
        conversionFactor: line.conversionFactor.toString(),
        conversionPrecision: line.conversionPrecision,
        variantCode: line.variantCode,
        variantAttributes: line.variantAttributes,
      };
    }),
    returns: returns.map((item) => ({
      id: item.id,
      number: item.debitNoteNumber,
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
        unit: line.purchaseUnit,
        quantity: line.purchaseQuantity.toString(),
        lineTotal: line.lineTotal.toString(),
      })),
    })),
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid receipt identifier." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = purchaseReturnInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid purchase return.", details: parsed.error.flatten() }, { status: 400 });

  let result: Awaited<ReturnType<typeof createPurchaseReturn>>;
  try {
    result = await prisma.$transaction((tx) =>
      createPurchaseReturn(tx, access.context.businessUnit.id, access.context.businessUnit.code, access.context.session.user.id, id, parsed.data),
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
      TARGET_NOT_AVAILABLE: "Supplier invoice not found.",
      RETURN_NOT_AVAILABLE: "Return not found.",
      LOCATION_NOT_AVAILABLE: "Select an active stock location.",
      LINE_NOT_AVAILABLE: "One or more receipt lines are unavailable.",
      OVER_RETURN: "Return quantity exceeds the unreturned receipt quantity.",
      AMOUNT_LIMIT_EXCEEDED: "Return amount exceeds the supported limit.",
      INSUFFICIENT_STOCK: "Insufficient stock at the selected location.",
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
