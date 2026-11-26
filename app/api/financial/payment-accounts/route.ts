import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { paymentAccountInputSchema } from "@/lib/finance-validation";

export async function GET() {
  const access = await getBusinessUnitAccess("cashbank.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const accounts = await prisma.paymentAccount.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const lines = await prisma.journalLine.findMany({
    where: { businessUnitId: access.context.businessUnit.id, journalEntry: { status: "POSTED" }, account: { paymentAccounts: { some: {} } } },
    select: { accountId: true, debit: true, credit: true },
  });
  const balances = new Map<string, Prisma.Decimal>();
  for (const line of lines) balances.set(line.accountId, (balances.get(line.accountId) ?? new Prisma.Decimal(0)).plus(line.debit).minus(line.credit));
  return NextResponse.json({ accounts: accounts.map((account) => ({
    ...account, balance: (balances.get(account.ledgerAccountId) ?? new Prisma.Decimal(0)).toFixed(2),
  })) });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("cashbank.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = paymentAccountInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment account.", details: parsed.error.flatten() }, { status: 400 });
  const businessUnitId = access.context.businessUnit.id;
  try {
    const account = await prisma.$transaction(async (tx) => {
      const ledger = await tx.account.findFirst({
        where: { id: parsed.data.ledgerAccountId, businessUnitId, type: "ASSET", isActive: true, isControlAccount: false },
        select: { id: true, code: true },
      });
      if (!ledger) throw new Error("LEDGER_ACCOUNT_INVALID");
      const created = await tx.paymentAccount.create({
        data: {
          businessUnitId, name: parsed.data.name, type: parsed.data.type, ledgerAccountId: ledger.id,
          bankName: parsed.data.bankName || null, accountNumberLast4: parsed.data.accountNumberLast4 || null,
          ifsc: parsed.data.ifsc || null, upiId: parsed.data.upiId || null,
        },
        include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
      });
      await tx.auditLog.create({ data: {
        userId: access.context.session.user.id, businessUnitId, action: "CREATE",
        entity: "PaymentAccount", entityId: created.id,
        details: { name: created.name, type: created.type, ledgerCode: ledger.code },
      } });
      return created;
    });
    return NextResponse.json({ account: { ...account, balance: "0.00" } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LEDGER_ACCOUNT_INVALID") return NextResponse.json({ error: "Select an active, non-control asset account from this business unit." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This payment account name or ledger account is already in use." }, { status: 409 });
    throw error;
  }
}
