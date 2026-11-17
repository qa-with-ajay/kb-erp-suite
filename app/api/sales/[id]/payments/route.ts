import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import { paymentInputSchema } from "@/lib/payment-validation";
import { recordSalePayment } from "@/lib/payment-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid invoice identifier." }, { status: 400 });

  const [sale, returns] = await Promise.all([
    prisma.sale.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    select: { total: true },
    }),
    prisma.saleReturn.aggregate({
      where: { saleId: id, businessUnitId: access.context.businessUnit.id, reversedAt: null },
      _sum: { total: true },
    }),
  ]);
  if (!sale) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const payments = await prisma.payment.findMany({
    where: { businessUnitId: access.context.businessUnit.id, saleId: id },
    include: {
      recorder: { select: { name: true } },
      reverser: { select: { name: true } },
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  const paidAmount = payments.reduce(
    (total, payment) => payment.reversedAt ? total : total.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  const returnedAmount = returns._sum.total ?? new Prisma.Decimal(0);
  const netBalance = sale.total.minus(returnedAmount).minus(paidAmount);
  return NextResponse.json({
    total: sale.total.toString(),
    returnedAmount: returnedAmount.toString(),
    paidAmount: paidAmount.toString(),
    balanceDue: netBalance.greaterThan(0) ? netBalance.toString() : "0",
    creditBalance: netBalance.isNegative() ? netBalance.abs().toString() : "0",
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toString(),
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      paidAt: payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      reversedAt: payment.reversedAt?.toISOString() ?? null,
      reversalReason: payment.reversalReason,
      recordedBy: payment.recorder.name,
      reversedBy: payment.reverser?.name ?? null,
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
  const parsed = paymentInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment.", details: parsed.error.flatten() }, { status: 400 });

  let result: Awaited<ReturnType<typeof recordSalePayment>>;
  try {
    result = await prisma.$transaction((tx) =>
      recordSalePayment(tx, access.context.businessUnit.id, access.context.session.user.id, id, parsed.data),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This payment request was already recorded." }, { status: 409 });
    }
    throw error;
  }
  if (result.kind === "error") {
    const status = result.error === "TARGET_NOT_AVAILABLE" ? 404 : 409;
    const message = result.error === "TARGET_NOT_AVAILABLE"
      ? "Invoice not found."
      : result.error === "AMOUNT_EXCEEDS_BALANCE"
        ? "Payment exceeds the invoice balance."
        : "This request key was already used for a different payment.";
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(
    { paymentId: result.paymentId, replayed: result.kind === "replayed" },
    { status: result.kind === "replayed" ? 200 : 201 },
  );
}
