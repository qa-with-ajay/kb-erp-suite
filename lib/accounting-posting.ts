import { Prisma, type PaymentMethod } from "@prisma/client";
import { randomUUID } from "node:crypto";

type JournalLineInput = {
  accountCode: string;
  description: string;
  debit?: Prisma.Decimal;
  credit?: Prisma.Decimal;
};

function dateOnly(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function voucherCode(prefix: string, date: Date, id: string) {
  return `${prefix}-${date.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
}

async function createPostedJournal(
  tx: Prisma.TransactionClient,
  input: {
    businessUnitId: string;
    actorId: string;
    entryDate: Date;
    sourceType: string;
    sourceId: string;
    narration: string;
    lines: JournalLineInput[];
  },
) {
  const existing = await tx.journalEntry.findFirst({
    where: { businessUnitId: input.businessUnitId, sourceType: input.sourceType, sourceId: input.sourceId },
    select: { id: true, voucherNumber: true },
  });
  if (existing) return existing;

  const entryDate = dateOnly(input.entryDate);
  const period = await tx.accountingPeriod.findFirst({
    where: { businessUnitId: input.businessUnitId, status: "OPEN", startDate: { lte: entryDate }, endDate: { gte: entryDate } },
    select: { id: true },
  });
  if (!period) throw new Error(`ACCOUNTING_PERIOD_REQUIRED:${input.sourceType}`);

  const accountCodes = [...new Set(input.lines.map((line) => line.accountCode))];
  const accounts = await tx.account.findMany({
    where: { businessUnitId: input.businessUnitId, code: { in: accountCodes }, isActive: true },
    select: { id: true, code: true },
  });
  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
  if (accountByCode.size !== accountCodes.length) {
    const missing = accountCodes.filter((code) => !accountByCode.has(code));
    throw new Error(`ACCOUNTING_ACCOUNTS_REQUIRED:${missing.join(",")}`);
  }

  const lines = input.lines
    .filter((line) => (line.debit ?? new Prisma.Decimal(0)).greaterThan(0) || (line.credit ?? new Prisma.Decimal(0)).greaterThan(0))
    .map((line, index) => ({
      businessUnitId: input.businessUnitId,
      accountId: accountByCode.get(line.accountCode)!,
      lineNumber: index + 1,
      description: line.description,
      debit: line.debit ?? new Prisma.Decimal(0),
      credit: line.credit ?? new Prisma.Decimal(0),
    }));
  const debit = lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
  const credit = lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
  if (lines.length < 2 || debit.lte(0) || !debit.equals(credit)) throw new Error("ACCOUNTING_JOURNAL_NOT_BALANCED");

  const id = randomUUID();
  const voucherNumber = voucherCode("AUTO", entryDate, id);
  const draft = await tx.journalEntry.create({
    data: {
      id,
      businessUnitId: input.businessUnitId,
      periodId: period.id,
      voucherNumber,
      entryDate,
      narration: input.narration,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: `auto:${input.sourceType}:${input.sourceId}`,
      createdBy: input.actorId,
      lines: { create: lines },
    },
    select: { id: true, voucherNumber: true },
  });
  await tx.journalEntry.update({
    where: { id: draft.id },
    data: { status: "POSTED", postedBy: input.actorId, postedAt: new Date() },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actorId,
      businessUnitId: input.businessUnitId,
      action: "POST",
      entity: "JournalEntry",
      entityId: draft.id,
      details: { voucherNumber, sourceType: input.sourceType, sourceId: input.sourceId, debit: debit.toFixed(2), credit: credit.toFixed(2) },
    },
  });
  return draft;
}

export async function postSaleAccounting(tx: Prisma.TransactionClient, businessUnitId: string, actorId: string, saleId: string) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, businessUnitId },
    select: { id: true, invoiceNumber: true, subtotal: true, taxAmount: true, total: true, costOfGoods: true, createdAt: true },
  });
  if (!sale) throw new Error("ACCOUNTING_SALE_NOT_FOUND");
  const lines: JournalLineInput[] = [
    { accountCode: "1100", description: `Receivable · ${sale.invoiceNumber}`, debit: sale.total },
    { accountCode: "4000", description: `Sales · ${sale.invoiceNumber}`, credit: sale.subtotal },
    { accountCode: "2100", description: `Output GST · ${sale.invoiceNumber}`, credit: sale.taxAmount },
    { accountCode: "5000", description: `Cost of goods sold · ${sale.invoiceNumber}`, debit: sale.costOfGoods },
    { accountCode: "1200", description: `Inventory relieved · ${sale.invoiceNumber}`, credit: sale.costOfGoods },
  ];
  return createPostedJournal(tx, {
    businessUnitId, actorId, entryDate: sale.createdAt, sourceType: "SALE", sourceId: sale.id,
    narration: `Sales invoice ${sale.invoiceNumber}`, lines,
  });
}

function cashAccount(method: PaymentMethod) {
  return method === "CASH" ? "1000" : "1010";
}

export async function postPaymentAccounting(tx: Prisma.TransactionClient, businessUnitId: string, actorId: string, paymentId: string) {
  const payment = await tx.payment.findFirst({
    where: { id: paymentId, businessUnitId, reversedAt: null },
    select: {
      id: true, amount: true, method: true, paidAt: true, sale: { select: { invoiceNumber: true } },
      purchaseReceipt: { select: { supplierInvoiceNumber: true } },
    },
  });
  if (!payment) throw new Error("ACCOUNTING_PAYMENT_NOT_FOUND");
  const cash = cashAccount(payment.method);
  if (payment.sale) {
    return createPostedJournal(tx, {
      businessUnitId, actorId, entryDate: payment.paidAt, sourceType: "PAYMENT", sourceId: payment.id,
      narration: `Customer receipt · ${payment.sale.invoiceNumber}`,
      lines: [
        { accountCode: cash, description: `Customer receipt · ${payment.sale.invoiceNumber}`, debit: payment.amount },
        { accountCode: "1100", description: `Receivable settled · ${payment.sale.invoiceNumber}`, credit: payment.amount },
      ],
    });
  }
  if (payment.purchaseReceipt) {
    return createPostedJournal(tx, {
      businessUnitId, actorId, entryDate: payment.paidAt, sourceType: "PAYMENT", sourceId: payment.id,
      narration: `Supplier payment · ${payment.purchaseReceipt.supplierInvoiceNumber}`,
      lines: [
        { accountCode: "2000", description: `Supplier payable settled · ${payment.purchaseReceipt.supplierInvoiceNumber}`, debit: payment.amount },
        { accountCode: cash, description: `Supplier payment · ${payment.purchaseReceipt.supplierInvoiceNumber}`, credit: payment.amount },
      ],
    });
  }
  throw new Error("ACCOUNTING_PAYMENT_TARGET_REQUIRED");
}

export async function postPurchaseReceiptAccounting(tx: Prisma.TransactionClient, businessUnitId: string, actorId: string, receiptId: string) {
  const receipt = await tx.purchaseReceipt.findFirst({
    where: { id: receiptId, businessUnitId },
    select: { id: true, supplierInvoiceNumber: true, subtotal: true, taxAmount: true, total: true, createdAt: true },
  });
  if (!receipt) throw new Error("ACCOUNTING_PURCHASE_RECEIPT_NOT_FOUND");
  return createPostedJournal(tx, {
    businessUnitId, actorId, entryDate: receipt.createdAt, sourceType: "PURCHASE_RECEIPT", sourceId: receipt.id,
    narration: `Supplier invoice ${receipt.supplierInvoiceNumber}`,
    lines: [
      { accountCode: "1200", description: `Inventory received · ${receipt.supplierInvoiceNumber}`, debit: receipt.subtotal },
      { accountCode: "1300", description: `Input GST · ${receipt.supplierInvoiceNumber}`, debit: receipt.taxAmount },
      { accountCode: "2000", description: `Supplier payable · ${receipt.supplierInvoiceNumber}`, credit: receipt.total },
    ],
  });
}

export async function reverseOperationalJournal(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  sourceType: string,
  sourceId: string,
  reason: string,
) {
  const reversalSourceType = `${sourceType}_REVERSAL`;
  const existingReversal = await tx.journalEntry.findFirst({
    where: { businessUnitId, sourceType: reversalSourceType, sourceId },
    select: { id: true, voucherNumber: true },
  });
  if (existingReversal) return existingReversal;

  const original = await tx.journalEntry.findFirst({
    where: { businessUnitId, sourceType, sourceId },
    include: { lines: true },
  });
  if (!original) return null;
  if (original.status !== "POSTED" || original.reversedByEntryId) throw new Error("ACCOUNTING_SOURCE_JOURNAL_NOT_REVERSIBLE");

  const reversalDate = dateOnly(new Date());
  const period = await tx.accountingPeriod.findFirst({
    where: { businessUnitId, status: "OPEN", startDate: { lte: reversalDate }, endDate: { gte: reversalDate } },
    select: { id: true },
  });
  if (!period) throw new Error("ACCOUNTING_PERIOD_REQUIRED:REVERSAL");

  const id = randomUUID();
  const voucherNumber = voucherCode("AUTO-REV", reversalDate, id);
  const reversal = await tx.journalEntry.create({
    data: {
      id, businessUnitId, periodId: period.id, voucherNumber,
      entryDate: reversalDate, narration: `Reversal of ${original.voucherNumber}: ${reason}`,
      sourceType: reversalSourceType, sourceId,
      idempotencyKey: `auto:${reversalSourceType}:${sourceId}`, createdBy: actorId,
      lines: { create: original.lines.map((line, index) => ({
        businessUnitId, accountId: line.accountId, lineNumber: index + 1,
        description: `Reversal: ${line.description ?? original.narration}`,
        debit: new Prisma.Decimal(line.credit), credit: new Prisma.Decimal(line.debit),
      })) },
    },
    select: { id: true, voucherNumber: true },
  });
  await tx.journalEntry.update({
    where: { id },
    data: { status: "POSTED", postedBy: actorId, postedAt: new Date() },
  });
  const changed = await tx.journalEntry.updateMany({
    where: { id: original.id, businessUnitId, status: "POSTED", reversedByEntryId: null },
    data: { status: "REVERSED", reversedByEntryId: reversal.id },
  });
  if (changed.count !== 1) throw new Error("ACCOUNTING_SOURCE_JOURNAL_STATE_CHANGED");
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "POST", entity: "JournalEntry", entityId: reversal.id,
      details: { sourceType: reversalSourceType, sourceId, reverses: original.voucherNumber, voucherNumber, reason },
    },
  });
  return reversal;
}
