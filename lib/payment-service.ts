import { Prisma, type PaymentMethod } from "@prisma/client";
import type { paymentInputSchema } from "@/lib/payment-validation";
import type { z } from "zod";

export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type PaymentTarget = "sale" | "purchaseReceipt";
export type PaymentResult =
  | { kind: "created" | "replayed" | "reversed"; paymentId: string }
  | { kind: "error"; error: "TARGET_NOT_AVAILABLE" | "PAYMENT_NOT_AVAILABLE" | "AMOUNT_EXCEEDS_BALANCE" | "IDEMPOTENCY_CONFLICT" | "ALREADY_REVERSED" };

function paymentMatches(
  existing: { saleId: string | null; purchaseReceiptId: string | null; amount: Prisma.Decimal; method: PaymentMethod; reference: string | null; notes: string | null; paidAt: Date },
  target: PaymentTarget,
  targetId: string,
  input: PaymentInput,
) {
  return existing.saleId === (target === "sale" ? targetId : null) &&
    existing.purchaseReceiptId === (target === "purchaseReceipt" ? targetId : null) &&
    existing.amount.equals(input.amount) &&
    existing.method === input.method &&
    existing.reference === (input.reference || null) &&
    existing.notes === (input.notes || null) &&
    existing.paidAt.getTime() === new Date(`${input.paidAt}T00:00:00.000Z`).getTime();
}

async function findExistingPayment(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  target: PaymentTarget,
  targetId: string,
  input: PaymentInput,
): Promise<PaymentResult | null> {
  const existing = await tx.payment.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey: input.idempotencyKey } },
    select: {
      id: true,
      saleId: true,
      purchaseReceiptId: true,
      amount: true,
      method: true,
      reference: true,
      notes: true,
      paidAt: true,
    },
  });
  if (!existing) return null;
  return paymentMatches(existing, target, targetId, input)
    ? { kind: "replayed", paymentId: existing.id }
    : { kind: "error", error: "IDEMPOTENCY_CONFLICT" };
}

export async function recordSalePayment(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  saleId: string,
  input: PaymentInput,
): Promise<PaymentResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Sale"
    WHERE "id" = ${saleId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const sale = await tx.sale.findFirst({
    where: { id: saleId, businessUnitId },
    select: { invoiceNumber: true, total: true },
  });
  if (!sale) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const existing = await findExistingPayment(tx, businessUnitId, "sale", saleId, input);
  if (existing) return existing;

  const totals = await tx.payment.aggregate({
    where: { businessUnitId, saleId, reversedAt: null },
    _sum: { amount: true },
  });
  const paid = totals._sum.amount ?? new Prisma.Decimal(0);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.greaterThan(sale.total.minus(paid))) {
    return { kind: "error", error: "AMOUNT_EXCEEDS_BALANCE" };
  }

  const payment = await tx.payment.create({
    data: {
      businessUnitId,
      saleId,
      idempotencyKey: input.idempotencyKey,
      amount,
      method: input.method,
      reference: input.reference || null,
      notes: input.notes || null,
      paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
      recordedBy: actorId,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
      details: {
        type: "CUSTOMER_COLLECTION",
        invoiceNumber: sale.invoiceNumber,
        amount: amount.toString(),
        method: input.method,
      },
    },
  });
  return { kind: "created", paymentId: payment.id };
}

export async function recordSupplierPayment(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  receiptId: string,
  input: PaymentInput,
): Promise<PaymentResult> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PurchaseReceipt"
    WHERE "id" = ${receiptId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
    FOR UPDATE
  `;
  if (!locked.length) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const receipt = await tx.purchaseReceipt.findFirst({
    where: { id: receiptId, businessUnitId },
    select: { supplierInvoiceNumber: true, total: true },
  });
  if (!receipt) return { kind: "error", error: "TARGET_NOT_AVAILABLE" };

  const existing = await findExistingPayment(tx, businessUnitId, "purchaseReceipt", receiptId, input);
  if (existing) return existing;

  const totals = await tx.payment.aggregate({
    where: { businessUnitId, purchaseReceiptId: receiptId, reversedAt: null },
    _sum: { amount: true },
  });
  const paid = totals._sum.amount ?? new Prisma.Decimal(0);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.greaterThan(receipt.total.minus(paid))) {
    return { kind: "error", error: "AMOUNT_EXCEEDS_BALANCE" };
  }

  const payment = await tx.payment.create({
    data: {
      businessUnitId,
      purchaseReceiptId: receiptId,
      idempotencyKey: input.idempotencyKey,
      amount,
      method: input.method,
      reference: input.reference || null,
      notes: input.notes || null,
      paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
      recordedBy: actorId,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
      details: {
        type: "SUPPLIER_PAYMENT",
        supplierInvoiceNumber: receipt.supplierInvoiceNumber,
        amount: amount.toString(),
        method: input.method,
      },
    },
  });
  return { kind: "created", paymentId: payment.id };
}

export async function reversePayment(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  actorId: string,
  target: PaymentTarget,
  targetId: string,
  paymentId: string,
  reason: string,
): Promise<PaymentResult> {
  const paymentWhere = target === "sale"
    ? { id: paymentId, businessUnitId, saleId: targetId }
    : { id: paymentId, businessUnitId, purchaseReceiptId: targetId };
  const payment = await tx.payment.findFirst({
    where: paymentWhere,
    select: {
      id: true,
      amount: true,
      method: true,
      reference: true,
      reversedAt: true,
      reversalReason: true,
    },
  });
  if (!payment) return { kind: "error", error: "PAYMENT_NOT_AVAILABLE" };

  const locked = target === "sale"
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Sale"
        WHERE "id" = ${targetId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
        FOR UPDATE
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PurchaseReceipt"
        WHERE "id" = ${targetId}::uuid AND "businessUnitId" = ${businessUnitId}::uuid
        FOR UPDATE
      `;
  if (!locked.length) return { kind: "error", error: "PAYMENT_NOT_AVAILABLE" };

  if (payment.reversedAt) {
    return payment.reversalReason === reason
      ? { kind: "replayed", paymentId }
      : { kind: "error", error: "ALREADY_REVERSED" };
  }

  const updated = await tx.payment.updateMany({
    where: { ...paymentWhere, reversedAt: null },
    data: { reversedAt: new Date(), reversedBy: actorId, reversalReason: reason },
  });
  if (!updated.count) {
    const current = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { reversalReason: true },
    });
    return current?.reversalReason === reason
      ? { kind: "replayed", paymentId }
      : { kind: "error", error: "ALREADY_REVERSED" };
  }

  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId,
      action: "REVERSE",
      entity: "Payment",
      entityId: payment.id,
      details: {
        amount: payment.amount.toString(),
        method: payment.method,
        reference: payment.reference,
        reason,
      },
    },
  });
  return { kind: "reversed", paymentId };
}
