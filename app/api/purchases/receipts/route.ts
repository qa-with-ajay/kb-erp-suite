import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import {
  isSamePurchaseReceiptRequest,
  receivePurchaseOrder,
  type PurchaseResult,
} from "@/lib/purchase-service";
import { parsePurchasesList, purchaseReceiptInputSchema } from "@/lib/purchase-validation";

type PurchaseError = Extract<PurchaseResult, { kind: "error" }>["error"];

const purchaseErrors: Record<PurchaseError, { message: string; status: number }> = {
  SUPPLIER_NOT_AVAILABLE: { message: "Select an active supplier in this business unit.", status: 400 },
  PRODUCT_NOT_AVAILABLE: { message: "One or more selected products are unavailable.", status: 400 },
  VARIANT_REQUIRED: { message: "Select a variant for the product.", status: 400 },
  VARIANT_NOT_AVAILABLE: { message: "The selected variant is unavailable.", status: 400 },
  PURCHASE_UNIT_NOT_AVAILABLE: { message: "The purchase unit is not available for this product.", status: 400 },
  CONVERSION_ROUNDS_TO_ZERO: { message: "This partial receipt rounds to zero base units. Increase the received purchase quantity.", status: 400 },
  ORDER_NOT_AVAILABLE: { message: "The purchase order is unavailable.", status: 404 },
  ORDER_CLOSED: { message: "This purchase order has already been fully received.", status: 409 },
  ORDER_LINE_NOT_AVAILABLE: { message: "A purchase order line is unavailable.", status: 400 },
  OVER_RECEIPT: { message: "The received quantity exceeds the remaining order quantity.", status: 409 },
  LOCATION_NOT_AVAILABLE: { message: "Select an active stock location in this business unit.", status: 400 },
  IDEMPOTENCY_CONFLICT: { message: "This request key was already used for a different receipt.", status: 409 },
  AMOUNT_LIMIT_EXCEEDED: { message: "The purchase exceeds the supported monetary amount.", status: 400 },
};

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = parsePurchasesList(new URL(request.url).searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Invalid receipt filters." }, { status: 400 });
  const { search, page, pageSize } = parsed.data;
  const where: Prisma.PurchaseReceiptWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    ...(search ? {
      OR: [
        { supplierInvoiceNumber: { contains: search, mode: "insensitive" } },
        { purchaseOrder: { orderNumber: { contains: search, mode: "insensitive" } } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.purchaseReceipt.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, orderNumber: true } },
        location: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseReceipt.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = purchaseReceiptInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid goods receipt.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  try {
    const result = await prisma.$transaction((tx) =>
      receivePurchaseOrder(tx, access.context.businessUnit.id, access.context.session.user.id, input),
    );
    if (result.kind === "error") {
      const { message, status } = purchaseErrors[result.error];
      return NextResponse.json({ error: result.productName ? `${result.productName}: ${message}` : message }, { status });
    }
    return NextResponse.json(
      { receiptId: result.id, replayed: result.kind === "replayed" },
      { status: result.kind === "replayed" ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.stockMovement.findUnique({
        where: {
          businessUnitId_idempotencyKey: {
            businessUnitId: access.context.businessUnit.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { purchaseReceipt: { include: { lines: true } } },
      });
      if (prior?.purchaseReceipt && isSamePurchaseReceiptRequest(prior, input, access.context.businessUnit.id)) {
        return NextResponse.json({ receiptId: prior.purchaseReceipt.id, replayed: true });
      }
      if (prior) return NextResponse.json({ error: purchaseErrors.IDEMPOTENCY_CONFLICT.message }, { status: 409 });
      return NextResponse.json(
        { error: "This supplier invoice number has already been recorded for this business unit and supplier." },
        { status: 409 },
      );
    }
    throw error;
  }
}
