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
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  const receipts = order.receipts.map(({ payments, ...receipt }) => {
    const paidAmount = payments.reduce(
      (sum, payment) => payment.reversedAt ? sum : sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const balanceDue = receipt.total.minus(paidAmount);
    return {
      ...receipt,
      paidAmount: paidAmount.toString(),
      balanceDue: balanceDue.toString(),
      paymentStatus: balanceDue.isZero() ? "PAID" : paidAmount.isZero() ? "UNPAID" : "PARTIAL",
    };
  });
  return NextResponse.json({ order: { ...order, receipts } });
}
