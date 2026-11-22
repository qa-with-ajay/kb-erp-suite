import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { parseStockList, stockMovementInputSchema } from "@/lib/stock-validation";
import { createStockMovement, isSameStockMovementRequest, type StockMovementInput, type StockMovementResult } from "@/lib/stock-service";

type MovementError = Extract<StockMovementResult, { kind: "error" }>["error"];

const movementErrors: Record<MovementError, { message: string; status: number }> = {
  IDEMPOTENCY_CONFLICT: { message: "This idempotency key was already used for a different request.", status: 409 },
  LOCATION_NOT_AVAILABLE: { message: "Select an active stock location in this business unit.", status: 400 },
  PRODUCT_NOT_AVAILABLE: { message: "Select an active product in this business unit.", status: 400 },
  VARIANT_REQUIRED: { message: "Select a variant for this product.", status: 400 },
  VARIANT_NOT_AVAILABLE: { message: "Select an active variant for this product.", status: 400 },
  OPENING_ALREADY_RECORDED: { message: "Opening stock can only be recorded before other stock movements.", status: 409 },
  INSUFFICIENT_STOCK: { message: "The movement would make stock negative.", status: 409 },
  UNIT_COST_REQUIRED: { message: "Unit cost is required for stock inward and stock-increasing adjustments.", status: 400 },
};

function movementResponse(movementId: string, replayed: boolean) {
  return NextResponse.json({ movementId, replayed }, { status: replayed ? 200 : 201 });
}

export async function GET(request: Request) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsedParams = parseStockList(new URL(request.url).searchParams);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid stock history filters." }, { status: 400 });
  const params = parsedParams.data;
  const searchFilter: Prisma.StockMovementWhereInput[] = params.search ? [{
    OR: [
      { reference: { contains: params.search, mode: "insensitive" } },
      {
        ledgerEntries: {
          some: {
            stockKind: "STANDARD",
            product: {
              is: {
                OR: [
                  { name: { contains: params.search, mode: "insensitive" } },
                  { sku: { contains: params.search, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      },
    ],
  }] : [];
  const where: Prisma.StockMovementWhereInput = {
    businessUnitId: access.context.businessUnit.id,
    AND: [{ ledgerEntries: { some: { stockKind: "STANDARD" } } }, ...searchFilter],
  };
  const [items, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true } },
        ledgerEntries: {
          where: { stockKind: "STANDARD" },
          include: {
            product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            variant: { select: { id: true, code: true, attributes: true } },
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;

  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = stockMovementInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid stock movement.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input: StockMovementInput = parsed.data;

  try {
    const result = await prisma.$transaction((tx) =>
      createStockMovement(tx, businessUnit.id, session.user.id, input),
    );
    if (result.kind === "error") {
      const { message, status } = movementErrors[result.error];
      return NextResponse.json({ error: message }, { status });
    }
    return movementResponse(result.movementId, result.kind === "replayed");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const prior = await prisma.stockMovement.findUnique({
        where: {
          businessUnitId_idempotencyKey: {
            businessUnitId: businessUnit.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { ledgerEntries: true },
      });
      if (prior && isSameStockMovementRequest(prior, input, businessUnit.id)) {
        return movementResponse(prior.id, true);
      }
      if (prior) return NextResponse.json({ error: movementErrors.IDEMPOTENCY_CONFLICT.message }, { status: 409 });
      return NextResponse.json({ error: "A conflicting stock balance was updated. Retry with a new request key." }, { status: 409 });
    }
    throw error;
  }
}
