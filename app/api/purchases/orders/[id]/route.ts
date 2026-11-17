import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      lines: { orderBy: { lineNumber: "asc" } },
      receipts: {
        include: {
          lines: { orderBy: { lineNumber: "asc" } },
          payments: { select: { amount: true, reversedAt: true } },
          returns: { select: { total: true, reversedAt: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  const receipts = order.receipts.map(({ payments, returns, ...receipt }) => {
    const paidAmount = payments.reduce(
      (sum, payment) => payment.reversedAt ? sum : sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const returnedAmount = returns.reduce(
      (sum, item) => item.reversedAt ? sum : sum.plus(item.total),
      new Prisma.Decimal(0),
    );
    const netBalance = receipt.total.minus(returnedAmount).minus(paidAmount);
    const balanceDue = netBalance.greaterThan(0) ? netBalance : new Prisma.Decimal(0);
    const creditBalance = netBalance.isNegative() ? netBalance.abs() : new Prisma.Decimal(0);
    return {
      ...receipt,
      returnedAmount: returnedAmount.toString(),
      paidAmount: paidAmount.toString(),
      balanceDue: balanceDue.toString(),
      creditBalance: creditBalance.toString(),
      paymentStatus: creditBalance.isPositive() ? "CREDIT" : balanceDue.isZero() ? "PAID" : paidAmount.isZero() ? "UNPAID" : "PARTIAL",
    };
  });
  return NextResponse.json({ order: { ...order, receipts } });
}
