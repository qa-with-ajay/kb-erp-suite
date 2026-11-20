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

        <div className="mt-6">
          <PaymentPanel endpoint={`/api/sales/${sale.id}/payments`} currency={currency} canManage={canManagePayments} />
          <ReturnPanel endpoint={`/api/sales/${sale.id}/returns`} kind="sale" currency={currency} canManage={canManagePayments} />
        </div>
      </div>
    </main>
  );
}
