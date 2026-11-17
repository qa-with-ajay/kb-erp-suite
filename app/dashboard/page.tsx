import Link from "next/link";
import { redirect } from "next/navigation";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";
import { getUnitDashboardData, formatAmount, formatQuantity } from "@/lib/dashboard-data";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </article>
  );
}

export default async function DashboardPage() {
  let access = await getBusinessUnitAccess("reports.unit.read");
  if (!access.ok && access.status === 403) access = await getBusinessUnitAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/inventory");

  const [dashboard, canViewBilling, canManageCustomers, canManageSuppliers, canManagePurchases] = await Promise.all([
    getUnitDashboardData(access.context.businessUnit.id),
    getBusinessUnitAccess("billing.read").then((result) => result.ok),
    getBusinessUnitAccess("customers.manage").then((result) => result.ok),
    getBusinessUnitAccess("suppliers.manage").then((result) => result.ok),
    getBusinessUnitAccess("purchases.manage").then((result) => result.ok),
  ]);
  if (!dashboard) redirect("/inventory");

  const financialMetrics = ["Purchases", "Expenses", "Customer receivables", "Supplier payables", "Customer account credits", "Supplier account credits"];

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-emerald-800">KUMAR BROTHERS & ASSOCIATES</p>
          <h1 className="mt-1 text-2xl font-bold">{dashboard.name} Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Current inventory and business overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <BusinessUnitSwitcher />
          <div className="text-right text-sm">
            <p className="font-semibold">{access.context.session.user.name}</p>
            <p className="text-gray-500">{access.context.session.user.role}</p>
          </div>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Active products" value={dashboard.productCount.toLocaleString("en-IN")} detail="In this business unit" />
          <MetricCard label="Active categories" value={dashboard.categoryCount.toLocaleString("en-IN")} detail="In this business unit" />
          <MetricCard label="Active brands" value={dashboard.brandCount.toLocaleString("en-IN")} detail="In this business unit" />
          <MetricCard
            label="Stock valuation"
            value={formatAmount(dashboard.stockValue, dashboard.currency)}
            detail="Standard stock at average cost; remnants excluded"
          />
          <MetricCard label="Stock movements" value={dashboard.movementCount.toLocaleString("en-IN")} detail="Recorded for this unit" />
        </div>
      </section>

      {canViewBilling && <section className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Low-stock alerts</h2>
              <p className="mt-1 text-sm text-gray-600">
                {dashboard.lowStockCount} active product{dashboard.lowStockCount === 1 ? "" : "s"} at or below minimum stock.
              </p>
            </div>
            <Link href="/inventory/products" className="text-sm font-semibold text-emerald-900 hover:underline">
              View products
            </Link>
          </div>
          {dashboard.lowStockItems.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">SKU</th><th className="py-2 pr-4">Current</th><th className="py-2">Minimum</th></tr>
                </thead>
                <tbody>
                  {dashboard.lowStockItems.map((item) => (
                    <tr key={item.productId} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium">{item.productName}</td>
                      <td className="py-3 pr-4 text-gray-600">{item.sku}</td>
                      <td className="py-3 pr-4 text-amber-800">{formatQuantity(item.currentStock)} {item.baseUnit}</td>
                      <td className="py-3">{formatQuantity(item.minimumStock)} {item.baseUnit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
              No active products are at or below their configured minimum stock.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Financial overview</h2>
          <p className="mt-1 text-sm text-gray-600">Net sales for {dashboard.name}, after returns; gross profit reflects restocked returns.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-gray-600">Invoiced sales (all time)</p>
              <p className="mt-2 text-lg font-bold">{formatAmount(dashboard.salesTotal, dashboard.currency)}</p>
              <p className="mt-1 text-xs text-gray-500">{dashboard.invoiceCount} invoice{dashboard.invoiceCount === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-gray-600">Gross profit on sales</p>
              <p className="mt-2 text-lg font-bold">{formatAmount(dashboard.grossProfit, dashboard.currency)}</p>
              <p className="mt-1 text-xs text-gray-500">Before expenses and overhead</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {financialMetrics.map((metric) => {
              const balance = metric === "Customer receivables"
                ? formatAmount(dashboard.accountsReceivable, dashboard.currency)
                : metric === "Supplier payables"
                  ? formatAmount(dashboard.accountsPayable, dashboard.currency)
                  : metric === "Customer account credits"
                    ? formatAmount(dashboard.customerCredits, dashboard.currency)
                    : metric === "Supplier account credits"
                      ? formatAmount(dashboard.supplierCredits, dashboard.currency)
                  : null;
              return (
                <div key={metric} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{metric}</p>
                  <p className={`mt-2 font-semibold ${balance ? "text-gray-900" : "text-gray-400"}`}>
                    {balance ?? (metric === "Purchases" ? "Tracked in purchase orders" : "Not tracked yet")}
                  </p>
                  {metric === "Customer receivables" && <p className="mt-1 text-xs text-gray-500">Outstanding customer invoices</p>}
                  {metric === "Supplier payables" && <p className="mt-1 text-xs text-gray-500">Outstanding supplier invoices</p>}
                  {metric === "Purchases" && canManagePurchases && (
                    <Link href="/purchases" className="mt-1 inline-block text-xs font-medium text-emerald-900 hover:underline">Open purchases</Link>
                  )}
                </div>
              );
            })}
          </div>
          <Link href="/sales" className="mt-4 inline-block text-sm font-semibold text-emerald-900 hover:underline">Open sales & billing</Link>
        </div>
      </section>}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Inventory management</h2>
            <p className="mt-1 text-sm text-gray-600">Manage this unit’s product catalogue, variants and units.</p>
          </div>
          <Link href="/inventory" className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Open inventory
          </Link>
        </div>
      </section>

      {(canManageCustomers || canManageSuppliers) && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Business records</h2>
          <p className="mt-1 text-sm text-gray-600">Manage records separately for the selected business unit.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {canManageCustomers && <Link href="/customers" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-emerald-800">Customers</Link>}
            {canManageSuppliers && <Link href="/suppliers" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-emerald-800">Suppliers</Link>}
          </div>
        </section>
      )}
      {canManagePurchases && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Purchases</h2>
          <p className="mt-1 text-sm text-gray-600">Create purchase orders, receive goods into stock, and review supplier invoices.</p>
          <Link href="/purchases" className="mt-4 inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-emerald-800">
            Manage purchases
          </Link>
        </section>
      )}
    </main>
  );
}
