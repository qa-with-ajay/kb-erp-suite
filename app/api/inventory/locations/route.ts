
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";

export async function GET(request: NextRequest) {
  try {
    const access = await getInventoryAccess("inventory.read");

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    const { businessUnit } = access.context;
    const { searchParams } = new URL(request.url);

    const activeParam = searchParams.get("active");
    const search = searchParams.get("search")?.trim() ?? "";

    const parsedPage = Number.parseInt(
      searchParams.get("page") ?? "1",
      10
    );

    const parsedPageSize = Number.parseInt(
      searchParams.get("pageSize") ?? "100",
      10
    );

    const page = Math.max(
      1,
      Number.isFinite(parsedPage) ? parsedPage : 1
    );

    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.isFinite(parsedPageSize) ? parsedPageSize : 100
      )
    );

    const where = {
      businessUnitId: businessUnit.id,

      ...(activeParam === "true"
        ? { isActive: true }
        : activeParam === "false"
          ? { isActive: false }
          : {}),

      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                code: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.stockLocation.findMany({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),

      prisma.stockLocation.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET /api/inventory/locations:", error);

    return NextResponse.json(
      { error: "Unable to load stock locations." },
      { status: 500 }
    );
  }
}
