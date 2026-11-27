import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_DATABASE = "kb_erp_accounting_dev";
const FY_NAME = "FY 2026-27";
const FY_START = new Date("2026-04-01T00:00:00.000Z");
const FY_END = new Date("2027-03-31T00:00:00.000Z");

const amount = (value) => new Prisma.Decimal(value).toDecimalPlaces(2);
const demoVouchers = [
  {
    key: "capital-cash", voucher: "DEMO-FIN-001", date: "2026-04-05",
    narration: "Demo opening capital introduced into cash",
    lines: [["1000", 500000, 0], ["3000", 0, 500000]],
  },
  {
    key: "capital-bank", voucher: "DEMO-FIN-002", date: "2026-04-05",
    narration: "Demo opening capital introduced into bank",
    lines: [["1010", 200000, 0], ["3000", 0, 200000]],
  },
  {
    key: "cash-sales", voucher: "DEMO-FIN-003", date: "2026-05-15",
    narration: "Demo cash sales for the financial year",
    lines: [["1000", 250000, 0], ["4000", 0, 250000]],
  },
  {
    key: "credit-sales", voucher: "DEMO-FIN-004", date: "2026-06-20",
    narration: "Demo credit sales to customers",
    lines: [["1100", 120000, 0], ["4000", 0, 120000]],
  },
  {
    key: "customer-receipt", voucher: "DEMO-FIN-005", date: "2026-07-10",
    narration: "Demo collection against customer receivables",
    lines: [["1000", 70000, 0], ["1100", 0, 70000]],
  },
  {
    key: "inventory-purchase", voucher: "DEMO-FIN-006", date: "2026-08-08",
    narration: "Demo inventory purchased on supplier credit",
    lines: [["1200", 90000, 0], ["2000", 0, 90000]],
  },
  {
    key: "supplier-payment", voucher: "DEMO-FIN-007", date: "2026-09-12",
    narration: "Demo payment made to supplier from bank",
    lines: [["2000", 50000, 0], ["1010", 0, 50000]],
  },
  {
    key: "rent-expense", voucher: "DEMO-FIN-008", date: "2026-10-01",
    narration: "Demo monthly premises rent paid in cash",
    lines: [["6000", 30000, 0], ["1000", 0, 30000]],
  },
  {
    key: "cost-of-sales", voucher: "DEMO-FIN-009", date: "2026-10-18",
    narration: "Demo cost of goods sold",
    lines: [["5000", 80000, 0], ["1200", 0, 80000]],
  },
];

async function seedUnit(unit, actorId) {
  const period = await prisma.accountingPeriod.findFirst({
    where: {
      businessUnitId: unit.id,
      name: FY_NAME,
      startDate: FY_START,
      endDate: FY_END,
      status: "OPEN",
    },
  });
  if (!period) throw new Error(`Open ${FY_NAME} is missing for ${unit.code}. Run migrations first.`);

  const accounts = await prisma.account.findMany({
    where: { businessUnitId: unit.id, code: { in: ["1000", "1010", "1100", "1200", "2000", "3000", "4000", "5000", "6000"] }, isActive: true },
    select: { id: true, code: true, type: true },
  });
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const requiredCodes = ["1000", "1010", "1100", "1200", "2000", "3000", "4000", "5000", "6000"];
  const missing = requiredCodes.filter((code) => !accountByCode.has(code));
  if (missing.length) throw new Error(`Missing chart-of-account codes for ${unit.code}: ${missing.join(", ")}`);

  let created = 0;
  let skipped = 0;
  for (const voucher of demoVouchers) {
    const sourceId = `kb-demo-financial:${FY_NAME}:${voucher.key}`;
    const existing = await prisma.journalEntry.findUnique({
      where: { businessUnitId_sourceType_sourceId: { businessUnitId: unit.id, sourceType: "DEMO_FINANCIAL", sourceId } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== "POSTED") {
        throw new Error(`Existing demo voucher ${voucher.voucher} for ${unit.code} is ${existing.status}; inspect it before re-running the seed.`);
      }
      skipped += 1;
      continue;
    }

    const debitTotal = voucher.lines.reduce((sum, line) => sum + line[1], 0);
    const creditTotal = voucher.lines.reduce((sum, line) => sum + line[2], 0);
    if (debitTotal <= 0 || debitTotal !== creditTotal) {
      throw new Error(`Unbalanced demo voucher definition: ${voucher.voucher}`);
    }

    await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          businessUnitId: unit.id,
          periodId: period.id,
          voucherNumber: voucher.voucher,
          entryDate: new Date(`${voucher.date}T00:00:00.000Z`),
          narration: `[DEMO DATA] ${voucher.narration}`,
          status: "DRAFT",
          sourceType: "DEMO_FINANCIAL",
          sourceId,
          idempotencyKey: sourceId,
          createdBy: actorId,
          lines: {
            create: voucher.lines.map(([code, debit, credit], index) => ({
              businessUnitId: unit.id,
              accountId: accountByCode.get(String(code)).id,
              lineNumber: index + 1,
              description: `[DEMO] ${voucher.narration}`,
              debit: amount(debit),
              credit: amount(credit),
            })),
          },
        },
      });

      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "POSTED", postedBy: actorId, postedAt: new Date() },
      });
    }, { timeout: 30000 });
    created += 1;
  }
  console.log(`${unit.name}: created ${created}, already present ${skipped} demo vouchers.`);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Financial demo seeding is disabled in production.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\\//, "");
  if (databaseName !== DEMO_DATABASE) {
    throw new Error(`Safety check failed: this seed only runs on ${DEMO_DATABASE}; current database is ${databaseName || "(unknown)"}.`);
  }

  const actor = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!actor) throw new Error("Create an active administrator user before seeding financial demo data.");

  const units = await prisma.businessUnit.findMany({
    where: { isActive: true },
    include: { profile: { select: { currency: true } } },
    orderBy: { name: "asc" },
  });
  if (!units.length) throw new Error("No active business units found. Run the base data seed first.");

  console.log(`Seeding sample financial vouchers for ${units.length} active business units in ${DEMO_DATABASE}.`);
  for (const unit of units) await seedUnit(unit, actor.id);
  console.log("Financial demo data is ready. Re-running this command will not duplicate vouchers.");
}

main()
  .catch((error) => {
    console.error("Unable to seed financial demo data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
