import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { createSale, isSameSaleRequest, type SaleResult } from "@/lib/sales-service";
import { z } from "zod";
import { parseSalesList, saleInputSchema } from "@/lib/sales-validation";

// Optional first payment, captured with the sale. Parsed separately so the existing saleInputSchema is untouched.
const initialPaymentSchema = z.object({
  // payInFull = settle the server-computed total (avoids browser/server rounding differences).
  payInFull: z.boolean().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount").optional(),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(100).optional(),
}).refine((value) => value.payInFull || value.amount !== undefined, { message: "Amount is required." });

class PaymentRejected extends Error {}

type SaleError = Extract<SaleResult, { kind: "error" }>["error"];

const saleErrors: Record<SaleError, { message: string; status: number }> = {
  IDEMPOTENCY_CONFLICT: { message: "This request key was already used for a different sale.", status: 409 },
  LOCATION_NOT_AVAILABLE: { message: "Select an active stock location in this business unit.", status: 400 },
  CUSTOMER_NOT_AVAILABLE: { message: "Select an active customer in this business unit.", status: 400 },
  CUSTOMER_DUPLICATE: { message: "Multiple customer records match this phone or the name conflicts with another record. Resolve the duplicate in Customer Master first.", status: 409 },
  CUSTOMER_PHONE_REQUIRED: { message: "Enter a valid 10-digit phone number to save this customer to Customer Master.", status: 400 },
  PRODUCT_NOT_AVAILABLE: { message: "One or more selected products are unavailable.", status: 400 },
  VARIANT_REQUIRED: { message: "Select a variant for the product.", status: 400 },
  VARIANT_NOT_AVAILABLE: { message: "The selected variant is unavailable.", status: 400 },
  AMOUNT_LIMIT_EXCEEDED: { message: "The invoice exceeds the supported monetary amount.", status: 400 },
  INSUFFICIENT_STOCK: { message: "There is not enough stock for the requested quantity.", status: 409 },
  INVALID_QUANTITY: { message: "Allocate regular stock in whole stock units. The selected sales unit may use up to four decimal places.", status: 400 },
  INVALID_ALLOCATION: { message: "Select valid stock sources and ensure their combined quantity matches the invoice quantity.", status: 400 },
  REMNANT_NOT_AVAILABLE: { message: "One or more selected remnants are no longer available in the selected location.", status: 409 },
  UNIT_MISMATCH: { message: "The selected remnant uses a different measurement unit from this sale.", status: 400 },
  CUSTOMER_DUPLICATE: { message: "More than one customer record matches this phone number. Select the correct existing customer before continuing.", status: 409 },
  CUSTOMER_PHONE_REQUIRED: { message: "A valid 10-digit phone number is required to create a customer record.", status: 400 },
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
  const { payment: rawPayment, ...saleBody } =
    typeof body.data === "object" && body.data !== null ? (body.data as Record<string, unknown>) : { payment: undefined };
  const parsedPayment = rawPayment === undefined ? null : initialPaymentSchema.safeParse(rawPayment);
  if (parsedPayment && !parsedPayment.success) {
    return NextResponse.json({ error: "Invalid payment details." }, { status: 400 });
  }
  const payment = parsedPayment?.data ?? null;
  const parsed = saleInputSchema.safeParse(saleBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sale.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  if (input.saveCustomerToMaster && !input.customerId && input.customerName?.trim()) {
    const customerAccess = await getBusinessUnitAccess("customers.manage");
    if (!customerAccess.ok) return NextResponse.json({ error: customerAccess.error }, { status: customerAccess.status });
    if (customerAccess.context.businessUnit.id !== access.context.businessUnit.id) {
      return NextResponse.json({ error: "Customer access is not available for the active business unit." }, { status: 403 });
    }
  }

  try {
    // Sale + first payment commit or roll back together.
    const result = await prisma.$transaction(async (tx) => {
      const sale = await createSale(tx, access.context.businessUnit.id, access.context.session.user.id, input);
      // Errors and idempotent replays never create another payment.
      if (sale.kind === "error" || sale.kind === "replayed" || !payment) return sale;

      const { total } = await tx.sale.findUniqueOrThrow({ where: { id: sale.saleId }, select: { total: true } });
      const amount = payment.payInFull ? total : new Prisma.Decimal(payment.amount ?? "0");
      if (amount.greaterThan(total)) throw new PaymentRejected("Amount received cannot exceed the invoice total.");
      if (amount.lessThan(total) && !input.customerId && !input.customerName?.trim()) {
        throw new PaymentRejected("Select or enter a customer to leave a balance due.");
      }
      if (amount.greaterThan(0)) {
        await tx.payment.create({
          data: {
            businessUnitId: access.context.businessUnit.id,
            saleId: sale.saleId,
            idempotencyKey: `${input.idempotencyKey}:initial-payment`,
            amount,
            method: payment.method,
            reference: payment.reference || null,
            recordedBy: access.context.session.user.id,
          },
        });
        // Mirror createSale's audit trail. Align action/entity naming with your /payments route if it differs.
        await tx.auditLog.create({
          data: {
            userId: access.context.session.user.id,
            businessUnitId: access.context.businessUnit.id,
            action: "CREATE",
            entity: "Payment",
            entityId: sale.saleId,
            details: { invoiceNumber: sale.invoiceNumber, amount: amount.toString(), method: payment.method, source: "sale-checkout" },
          },
        });
      }
      return sale;
    });
    if (result.kind === "error") {
      const { message, status } = saleErrors[result.error];
      return NextResponse.json({ error: result.productName ? `${result.productName}: ${message}` : message }, { status });
    }
    return saleResponse(result.saleId, result.invoiceNumber, result.kind === "replayed");
  } catch (error) {
    if (error instanceof Error && error.message === "SALE_STOCK_CHANGED") {
      return NextResponse.json({ error: "Stock changed while completing the invoice. Refresh available stock sources and retry." }, { status: 409 });
    }
    if (error instanceof PaymentRejected) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.stockMovement.findUnique({
        where: {
          businessUnitId_idempotencyKey: {
            businessUnitId: access.context.businessUnit.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { sale: { include: { lines: { include: { stockAllocations: true } } } } },
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
