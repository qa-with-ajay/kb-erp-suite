import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET() {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const periods = await prisma.accountingPeriod.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    include: { _count: { select: { journalEntries: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json({ periods });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("accounting.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid accounting period details." }, { status: 400 });
  const value = body as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const start = typeof value.startDate === "string" ? value.startDate : "";
  const end = typeof value.endDate === "string" ? value.endDate : "";
  const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;
  const validDate = (date: string) => datePattern.test(date) && !Number.isNaN(new Date(date + "T00:00:00.000Z").getTime()) && new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) === date;
  if (name.length < 3 || name.length > 60 || !validDate(start) || !validDate(end) || start > end) {
    return NextResponse.json({ error: "Provide a period name and a valid start/end date range." }, { status: 400 });
  }
  try {
    const period = await prisma.$transaction(async (tx) => {
      const overlap = await tx.accountingPeriod.findFirst({
        where: {
          businessUnitId: access.context.businessUnit.id,
          startDate: { lte: new Date(end + "T00:00:00.000Z") },
          endDate: { gte: new Date(start + "T00:00:00.000Z") },
        },
        select: { id: true, name: true },
      });
      if (overlap) throw new Error("PERIOD_OVERLAP:" + overlap.name);
      const created = await tx.accountingPeriod.create({
        data: {
          businessUnitId: access.context.businessUnit.id,
          name,
          startDate: new Date(start + "T00:00:00.000Z"),
          endDate: new Date(end + "T00:00:00.000Z"),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
          action: "CREATE", entity: "AccountingPeriod", entityId: created.id,
          details: { name, startDate: start, endDate: end },
        },
      });
      return created;
    });
    return NextResponse.json({ period }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERIOD_OVERLAP:")) {
      return NextResponse.json({ error: `This date range overlaps ${error.message.slice("PERIOD_OVERLAP:".length)}.` }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An accounting period with this name already exists." }, { status: 409 });
    }
    throw error;
  }
}
