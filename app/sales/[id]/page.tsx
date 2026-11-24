import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { mapSaleToInvoice } from "@/components/invoice/mapSaleToInvoice";
import { saleInvoiceSelect } from "@/components/invoice/saleInvoiceSelect";
import { PaymentPanel } from "@/components/payment-panel";
import { ReturnPanel } from "@/components/return-panel";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const sale = await prisma.sale.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    select: saleInvoiceSelect,
  });
  if (!sale) notFound();

  const stockAllocations = await prisma.saleLineStockAllocation.findMany({
    where: { businessUnitId: access.context.businessUnit.id, saleLine: { saleId: id } },
    select: {
      sourceType: true, quantity: true, unit: true, baseQuantity: true, unitCost: true, lineCost: true,
      remnant: { select: { code: true } },
      saleLine: { select: { lineNumber: true, productName: true, baseUnit: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const canManagePayments = (await getBusinessUnitAccess("billing.manage")).ok;
  const invoice = mapSaleToInvoice(sale);
  const currency = invoice.currency;

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <Breadcrumbs items={[{ label: "Sales", href: "/sales" }, { label: sale.invoiceNumber }]} />
        </div>

        <InvoiceDocument invoice={invoice} />

        {stockAllocations.length > 0 && (
          <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Inventory source allocation</h2>
            <p className="mt-1 text-xs text-gray-500">Internal stock traceability. This section is not printed on the customer invoice.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr><th className="py-2 pr-3">Invoice line</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Quantity taken</th><th className="py-2 pr-3">Invoice equivalent</th><th className="py-2 text-right">Cost</th></tr>
                </thead>
                <tbody>
                  {stockAllocations.map((allocation) => (
                    <tr key={allocation.saleLine.lineNumber + ":" + allocation.sourceType + ":" + (allocation.remnant?.code ?? "regular") + ":" + allocation.quantity.toString()} className="border-b last:border-0">
                      <td className="py-2 pr-3">{allocation.saleLine.productName}</td>
                      <td className="py-2 pr-3">{allocation.sourceType === "REMNANT" ? `Remnant · ${allocation.remnant?.code ?? "record"}` : "Regular stock"}</td>
                      <td className="py-2 pr-3">{allocation.quantity.toString()} {allocation.unit}</td>
                      <td className="py-2 pr-3">{allocation.baseQuantity.toString()} {allocation.saleLine.baseUnit}</td>
                      <td className="py-2 text-right">{new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(Number(allocation.lineCost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-6">
          <PaymentPanel endpoint={`/api/sales/${sale.id}/payments`} currency={currency} canManage={canManagePayments} />
          <ReturnPanel endpoint={`/api/sales/${sale.id}/returns`} kind="sale" currency={currency} canManage={canManagePayments} />
        </div>
      </div>
    </main>
  );
}
