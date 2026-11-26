import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { getBusinessDateUtc } from "@/lib/accounting-date";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const access = await getBusinessUnitAccess("accounting.close_period");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid accounting period ID." }, { status: 400 });
  }
  try {
    const period = await prisma.$transaction(async (tx) => {
      const existing = await tx.accountingPeriod.findFirst({
        where: { id, businessUnitId: access.context.businessUnit.id },
        select: { id: true, name: true, status: true, endDate: true },
      });
      if (!existing) throw new Error("PERIOD_NOT_FOUND");
      if (existing.status !== "OPEN") throw new Error("PERIOD_NOT_OPEN");
      const today = getBusinessDateUtc();
      if (existing.endDate > today) throw new Error("PERIOD_NOT_ENDED");
      const drafts = await tx.journalEntry.count({
        where: { businessUnitId: access.context.businessUnit.id, periodId: id, status: "DRAFT" },
      });
      if (drafts) throw new Error("PERIOD_HAS_DRAFTS");
      const changed = await tx.accountingPeriod.updateMany({
        where: { id, businessUnitId: access.context.businessUnit.id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: new Date(), closedBy: access.context.session.user.id },
      });
      if (changed.count !== 1) throw new Error("PERIOD_STATE_CHANGED");
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId: access.context.businessUnit.id,
          action: "CLOSE", entity: "AccountingPeriod", entityId: id,
          details: { name: existing.name, endDate: existing.endDate.toISOString().slice(0, 10) },
        },
      });
      return tx.accountingPeriod.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ period });
  } catch (error) {
    const messages: Record<string, { message: string; status: number }> = {
      PERIOD_NOT_FOUND: { message: "Accounting period was not found.", status: 404 },
      PERIOD_NOT_OPEN: { message: "Only open accounting periods can be closed.", status: 409 },
      PERIOD_NOT_ENDED: { message: "An accounting period can only be closed after its end date.", status: 409 },
      PERIOD_HAS_DRAFTS: { message: "Post or remove all draft vouchers before closing this period.", status: 409 },
      PERIOD_STATE_CHANGED: { message: "The period changed while closing. Refresh and try again.", status: 409 },
    };
    if (error instanceof Error && messages[error.message]) {
      const result = messages[error.message];
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    throw error;
  }
}
