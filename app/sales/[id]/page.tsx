import { Prisma } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PaymentPanel } from "@/components/payment-panel";
import { ReturnPanel } from "@/components/return-panel";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { PrintInvoiceButton } from "./print-invoice-button";

function formatAmount(value: string, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
}

function formatAddress(profile: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}) {
  return [profile.addressLine1, profile.addressLine2, profile.city, profile.state, profile.pincode]
    .filter(Boolean)
    .join(", ");
}

function formatVariant(code: string | null, attributes: unknown) {
  const entries = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? Object.entries(attributes).map(([key, value]) => `${key}: ${String(value)}`)
    : [];
  return [code, ...entries].filter(Boolean).join(" · ");
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const sale = await prisma.sale.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    select: {
      id: true,
      invoiceNumber: true,
      taxMode: true,
      customerName: true,
      customerPhone: true,
      subtotal: true,
      taxAmount: true,
      total: true,
      payments: { select: { amount: true, reversedAt: true } },
      returns: { select: { total: true, reversedAt: true } },
      createdAt: true,
      creator: { select: { name: true } },
      businessUnit: {
        select: {
          name: true,
          profile: {
            select: {
              legalName: true,
              tradeName: true,
              gstin: true,
              phone: true,
              email: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              pincode: true,
              currency: true,
            },
          },
        },
      },
      stockMovement: { select: { sourceLocation: { select: { name: true } } } },
      lines: {
        select: {
          id: true,
          lineNumber: true,
          productName: true,
          sku: true,
          baseUnit: true,
          variantCode: true,
          variantAttributes: true,
          quantity: true,
          unitPrice: true,
          gstPercentage: true,
          lineTax: true,
          lineTotal: true,
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!sale) notFound();
  const profile = sale.businessUnit.profile;
  const currency = profile?.currency || "INR";
  const address = profile ? formatAddress(profile) : "";
  const canManagePayments = (await getBusinessUnitAccess("billing.manage")).ok;
  const paidAmount = sale.payments.reduce(
    (total, payment) => payment.reversedAt ? total : total.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  const returnedAmount = sale.returns.reduce(
    (total, item) => item.reversedAt ? total : total.plus(item.total),
    new Prisma.Decimal(0),
  );
  const netBalance = sale.total.minus(returnedAmount).minus(paidAmount);
  const balanceDue = netBalance.greaterThan(0) ? netBalance : new Prisma.Decimal(0);
  const creditBalance = netBalance.isNegative() ? netBalance.abs() : new Prisma.Decimal(0);

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between print:hidden">
          <Breadcrumbs items={[{ label: "Sales", href: "/sales" }, { label: sale.invoiceNumber }]} />
          <PrintInvoiceButton />
        </div>
        <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-10 print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap justify-between gap-6 border-b border-gray-200 pb-6">
            <div>
              <p className="text-xs font-bold tracking-widest text-emerald-800">{sale.taxMode === "GST" ? "GST INVOICE" : "INVOICE"}</p>
              <h1 className="mt-2 text-2xl font-bold">{profile?.tradeName || sale.businessUnit.name}</h1>
              {profile?.legalName && profile.legalName !== profile.tradeName && <p className="mt-1 text-sm">{profile.legalName}</p>}
              {address && <p className="mt-2 max-w-sm text-sm text-gray-600">{address}</p>}
              {profile?.phone && <p className="mt-1 text-sm text-gray-600">Phone: {profile.phone}</p>}
              {profile?.email && <p className="mt-1 text-sm text-gray-600">{profile.email}</p>}
              {profile?.gstin && <p className="mt-1 text-sm font-medium">GSTIN: {profile.gstin}</p>}
            </div>
            <div className="min-w-52 text-sm">
              <p className="text-gray-500">Invoice number</p>
              <p className="mt-1 text-lg font-bold">{sale.invoiceNumber}</p>
              <p className="mt-3 text-gray-500">Date</p>
              <p className="mt-1 font-medium">{new Date(sale.createdAt).toLocaleString("en-IN")}</p>
              <p className="mt-3 text-gray-500">Tax mode</p>
              <p className="mt-1 font-medium">{sale.taxMode === "GST" ? "GST (added to listed price)" : "Non-GST"}</p>
              <p className="mt-3 text-gray-500">Location</p>
              <p className="mt-1 font-medium">{sale.stockMovement.sourceLocation?.name || "—"}</p>
            </div>
          </header>

          <section className="grid gap-6 border-b border-gray-200 py-5 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bill to</h2>
              <p className="mt-2 font-semibold">{sale.customerName || "Walk-in customer"}</p>
              {sale.customerPhone && <p className="mt-1 text-sm text-gray-600">{sale.customerPhone}</p>}
            </div>
            <div className="sm:text-right">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Issued by</h2>
              <p className="mt-2 font-semibold">{sale.creator.name}</p>
            </div>
          </section>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-gray-300 text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-3 pr-3">Item</th>
                  <th className="py-3 pr-3">Qty</th>
                  <th className="py-3 pr-3">Unit price</th>
                  {sale.taxMode === "GST" && <th className="py-3 pr-3">GST</th>}
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line) => (
                  <tr key={line.id} className="border-b border-gray-100">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{line.productName}</p>
                      <p className="mt-1 text-xs text-gray-500">{line.sku}{formatVariant(line.variantCode, line.variantAttributes) ? ` · ${formatVariant(line.variantCode, line.variantAttributes)}` : ""}</p>
                    </td>
                    <td className="py-3 pr-3">{line.quantity.toString()} {line.baseUnit}</td>
                    <td className="py-3 pr-3">{formatAmount(line.unitPrice.toString(), currency)}</td>
                    {sale.taxMode === "GST" && <td className="py-3 pr-3">{line.gstPercentage.toString()}% · {formatAmount(line.lineTax.toString(), currency)}</td>}
                    <td className="py-3 text-right font-medium">{formatAmount(line.lineTotal.toString(), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatAmount(sale.subtotal.toString(), currency)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>{formatAmount(sale.taxAmount.toString(), currency)}</span></div>
            <div className="flex justify-between border-t border-gray-300 pt-3 text-base font-bold"><span>Total</span><span>{formatAmount(sale.total.toString(), currency)}</span></div>
            <div className="flex justify-between"><span>Amount paid</span><span>{formatAmount(paidAmount.toString(), currency)}</span></div>
            <div className="flex justify-between"><span>Returns / credit notes</span><span>{formatAmount(returnedAmount.toString(), currency)}</span></div>
            <div className="flex justify-between font-semibold">
              <span>{creditBalance.isPositive() ? "Customer account credit" : "Balance due"}</span>
              <span>{formatAmount((creditBalance.isPositive() ? creditBalance : balanceDue).toString(), currency)}</span>
            </div>
          </section>
          <footer className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
            Full-unit sale • Stock was deducted when this invoice was issued.
          </footer>
        </article>
        <div className="mt-6 print:hidden">
          <ReturnPanel
            endpoint={`/api/sales/${sale.id}/returns`}
            kind="sale"
            currency={currency}
            canManage={canManagePayments}
          />
          <PaymentPanel endpoint={`/api/sales/${sale.id}/payments`} currency={currency} canManage={canManagePayments} />
        </div>
      </div>
    </main>
  );
}
