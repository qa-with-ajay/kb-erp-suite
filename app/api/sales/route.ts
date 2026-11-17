import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { createSale, isSameSaleRequest, type SaleResult } from "@/lib/sales-service";
import { parseSalesList, saleInputSchema } from "@/lib/sales-validation";

type SaleError = Extract<SaleResult, { kind: "error" }>["error"];

const saleErrors: Record<SaleError, { message: string; status: number }> = {
  IDEMPOTENCY_CONFLICT: { message: "This request key was already used for a different sale.", status: 409 },
  LOCATION_NOT_AVAILABLE: { message: "Select an active stock location in this business unit.", status: 400 },
  CUSTOMER_NOT_AVAILABLE: { message: "Select an active customer in this business unit.", status: 400 },
  PRODUCT_NOT_AVAILABLE: { message: "One or more selected products are unavailable.", status: 400 },
  VARIANT_REQUIRED: { message: "Select a variant for the product.", status: 400 },
  VARIANT_NOT_AVAILABLE: { message: "The selected variant is unavailable.", status: 400 },
  PANEL_UNIT_MUST_BE_PCS: { message: "Panel sales require panels to be stocked as whole PCS units. Cutting is not supported.", status: 400 },
  AMOUNT_LIMIT_EXCEEDED: { message: "The invoice exceeds the supported monetary amount.", status: 400 },
  INSUFFICIENT_STOCK: { message: "There is not enough stock for the requested full-unit sale.", status: 409 },
};

function saleResponse(saleId: string, invoiceNumber: string, replayed: boolean) {
  return NextResponse.json({ saleId, invoiceNumber, replayed }, { status: replayed ? 200 : 201 });
}

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsedParams = parseSalesList(new URL(request.url).searchParams);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid sales filters." }, { status: 400 });
  const params = parsedParams.data;
  const searchFilter: Prisma.SaleWhereInput[] = params.search ? [{
    OR: [
      { invoiceNumber: { contains: params.search, mode: "insensitive" } },
      { customerName: { contains: params.search, mode: "insensitive" } },
      { customerPhone: { contains: params.search, mode: "insensitive" } },
    ],
  }] : [];
  const where: Prisma.SaleWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    AND: searchFilter,
  };
  const [items, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        taxMode: true,
        customerName: true,
        subtotal: true,
        taxAmount: true,
        total: true,
        createdAt: true,
        payments: { select: { amount: true, reversedAt: true } },
        returns: { select: { total: true, reversedAt: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.sale.count({ where }),
  ]);
  const summarizedItems = items.map(({ payments, returns, ...sale }) => {
    const paidAmount = payments.reduce(
      (sum, payment) => payment.reversedAt ? sum : sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const returnedAmount = returns.reduce(
      (sum, item) => item.reversedAt ? sum : sum.plus(item.total),
      new Prisma.Decimal(0),
    );
    const netBalance = sale.total.minus(returnedAmount).minus(paidAmount);
    const balanceDue = netBalance.greaterThan(0) ? netBalance : new Prisma.Decimal(0);
    const creditBalance = netBalance.isNegative() ? netBalance.abs() : new Prisma.Decimal(0);
    return {
      ...sale,
      paidAmount: paidAmount.toString(),
      returnedAmount: returnedAmount.toString(),
      balanceDue: balanceDue.toString(),
      creditBalance: creditBalance.toString(),
      paymentStatus: creditBalance.isPositive() ? "CREDIT" : balanceDue.isZero() ? "PAID" : paidAmount.isZero() ? "UNPAID" : "PARTIAL",
    };
  });
  return NextResponse.json({ items: summarizedItems, total, page: params.page, pageSize: params.pageSize });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("billing.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = saleInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid full-unit sale.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const result = await prisma.$transaction((tx) =>
      createSale(tx, access.context.businessUnit.id, access.context.session.user.id, input),
    );
    if (result.kind === "error") {
      const { message, status } = saleErrors[result.error];
      return NextResponse.json({ error: result.productName ? `${result.productName}: ${message}` : message }, { status });
    }
    return saleResponse(result.saleId, result.invoiceNumber, result.kind === "replayed");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.stockMovement.findUnique({
        where: {
          businessUnitId_idempotencyKey: {
            businessUnitId: access.context.businessUnit.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { sale: { include: { lines: true } } },
      });
      if (prior?.sale && isSameSaleRequest(prior, input, access.context.businessUnit.id)) {
        return saleResponse(prior.sale.id, prior.sale.invoiceNumber, true);
      }
      if (prior) return NextResponse.json({ error: saleErrors.IDEMPOTENCY_CONFLICT.message }, { status: 409 });
      return NextResponse.json({ error: "The invoice number could not be allocated. Retry the sale." }, { status: 409 });
    }
    throw error;
  }
}
