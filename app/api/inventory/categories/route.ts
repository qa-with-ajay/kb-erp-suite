import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { catalogInputSchema, parseCatalogList, readJsonBody } from "@/lib/catalog-validation";

export async function GET(request: Request) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit } = access.context;

  const parsedParams = parseCatalogList(new URL(request.url).searchParams);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid list filters." }, { status: 400 });
  const params = parsedParams.data;
  const where: Prisma.CategoryWhereInput = {
    businessUnitId: businessUnit.id,
    ...(params.search ? { name: { contains: params.search, mode: "insensitive" } } : {}),
    ...(params.active === "all" ? {} : { isActive: params.active === "true" }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.category.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { session, businessUnit } = access.context;

  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = catalogInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid category data.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: { businessUnitId: businessUnit.id, name: parsed.data.name, description: parsed.data.description || null },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "CREATE",
          entity: "Category",
          entityId: created.id,
          details: { name: created.name },
        },
      });
      return created;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
    }
    throw error;
  }
}
