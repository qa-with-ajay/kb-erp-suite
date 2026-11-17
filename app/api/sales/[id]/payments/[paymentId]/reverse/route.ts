import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import { paymentReversalInputSchema } from "@/lib/payment-validation";
import { reversePayment } from "@/lib/payment-service";

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("billing.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id, paymentId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(paymentId).success) {
    return NextResponse.json({ error: "Invalid invoice or payment identifier." }, { status: 400 });
  }
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = paymentReversalInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "A reversal reason is required.", details: parsed.error.flatten() }, { status: 400 });

  const result = await prisma.$transaction((tx) =>
    reversePayment(tx, access.context.businessUnit.id, access.context.session.user.id, "sale", id, paymentId, parsed.data.reason),
  );
  if (result.kind === "error") {
    const status = result.error === "PAYMENT_NOT_AVAILABLE" ? 404 : 409;
    const message = result.error === "PAYMENT_NOT_AVAILABLE"
      ? "Payment not found for this invoice."
      : "This payment has already been reversed.";
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ paymentId: result.paymentId, replayed: result.kind === "replayed" });
}
