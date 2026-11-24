import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { prisma } from "@/lib/prisma";
import { reverseSaleReturn } from "@/lib/return-service";
import { returnReversalInputSchema } from "@/lib/return-validation";

type RouteContext = { params: Promise<{ id: string; returnId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const access = await getBusinessUnitAccess("billing.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id, returnId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(returnId).success) {
    return NextResponse.json({ error: "Invalid return identifier." }, { status: 400 });
  }
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = returnReversalInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid return reversal.", details: parsed.error.flatten() }, { status: 400 });

  let result: Awaited<ReturnType<typeof reverseSaleReturn>>;
  try {
    result = await prisma.$transaction((tx) =>
      reverseSaleReturn(tx, access.context.businessUnit.id, access.context.session.user.id, id, returnId, parsed.data),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SALE_RETURN_STOCK_CHANGED") {
      return NextResponse.json({ error: "Stock changed while reversing this return. Refresh inventory and retry." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This reversal request was already recorded." }, { status: 409 });
    }
    throw error;
  }
  if (result.kind === "error") {
    const messages = {
      TARGET_NOT_AVAILABLE: "Invoice not found.",
      RETURN_NOT_AVAILABLE: "Return not found.",
      INSUFFICIENT_STOCK: "The restocked items are no longer available to reverse this return.",
      IDEMPOTENCY_CONFLICT: "This request key was already used for a different reversal.",
      ALREADY_REVERSED: "This return has already been reversed.",
    };
    const status = result.error === "TARGET_NOT_AVAILABLE" || result.error === "RETURN_NOT_AVAILABLE" ? 404 : 409;
    return NextResponse.json({ error: messages[result.error] }, { status });
  }
  return NextResponse.json({ id: result.id, replayed: result.kind === "replayed" }, { status: result.kind === "replayed" ? 200 : 201 });
}
