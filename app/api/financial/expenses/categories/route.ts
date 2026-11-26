import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { expenseCategoryInputSchema } from "@/lib/finance-validation";

export async function GET() {
  const access = await getBusinessUnitAccess("expenses.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const categories = await prisma.expenseCategory.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    include: { expenseAccount: { select: { id: true, code: true, name: true } }, _count: { select: { expenses: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("expenses.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = expenseCategoryInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid expense category.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  try {
    const category = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id: parsed.data.expenseAccountId, businessUnitId, type: "EXPENSE", isActive: true, isControlAccount: false },
        select: { id: true },
      });
      if (!account) throw new Error("EXPENSE_ACCOUNT_INVALID");
      const created = await tx.expenseCategory.create({
        data: { businessUnitId, name: parsed.data.name, expenseAccountId: account.id },
        include: { expenseAccount: { select: { id: true, code: true, name: true } } },
      });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId, action: "CREATE",
        entity: "ExpenseCategory", entityId: created.id,
        details: { name: created.name, expenseAccountId: created.expenseAccountId },
      } });
      return created;
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "EXPENSE_ACCOUNT_INVALID") return NextResponse.json({ error: "Choose an active, non-control expense ledger account." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "An expense category with this name already exists." }, { status: 409 });
    throw error;
  }
}
