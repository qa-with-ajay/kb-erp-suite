import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";

const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores for the location code."),
});

const locationUpdateSchema = locationSchema.partial().extend({ isActive: z.boolean().optional() });

async function readBody(request: Request) {
  try {
    return { success: true as const, data: await request.json() };
  } catch {
    return { success: false as const };
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await getInventoryAccess("inventory.read");
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const { businessUnit } = access.context;
    const { searchParams } = new URL(request.url);
    const activeParam = searchParams.get("active");
    const search = searchParams.get("search")?.trim() ?? "";
    const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const parsedPageSize = Number.parseInt(searchParams.get("pageSize") ?? "100", 10);
    const page = Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1);
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(parsedPageSize) ? parsedPageSize : 100));
    const where = {
      businessUnitId: businessUnit.id,
      ...(activeParam === "true" ? { isActive: true } : activeParam === "false" ? { isActive: false } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { code: { contains: search, mode: "insensitive" as const } },
      ] } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.stockLocation.findMany({
        where,
        select: { id: true, name: true, code: true, isActive: true },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stockLocation.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/inventory/locations:", error);
    return NextResponse.json({ error: "Unable to load stock locations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;
  const body = await readBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = locationSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid stock location data.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.stockLocation.create({
        data: { businessUnitId: businessUnit.id, name: parsed.data.name, code: parsed.data.code.toUpperCase() },
        select: { id: true, name: true, code: true, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "CREATE",
          entity: "StockLocation",
          entityId: created.id,
          details: { name: created.name, code: created.code },
        },
      });
      return created;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A stock location with this name or code already exists in this business unit." }, { status: 409 });
    }
    console.error("POST /api/inventory/locations:", error);
    return NextResponse.json({ error: "Unable to create stock location." }, { status: 500 });
  }
}
