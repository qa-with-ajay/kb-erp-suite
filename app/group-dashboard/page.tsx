import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { formatAmount, formatQuantity, getGroupDashboardData } from "@/lib/dashboard-data";
import { getInventorySession, hasGroupPermission } from "@/lib/inventory-auth";

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </article>
  );
}

export default async function GroupDashboardPage() {
  const session = await getInventorySession();
  if (!session) redirect("/login");
  if (!(await hasGroupPermission(session.user.id, "group.dashboard.read"))) redirect("/dashboard");

  const units = await getGroupDashboardData();
  const productCount = units.reduce((total, unit) => total + unit.productCount, 0);
  const movementCount = units.reduce((total, unit) => total + unit.movementCount, 0);
  const lowStockCount = units.reduce((total, unit) => total + unit.lowStockCount, 0);
  const valuationByCurrency = new Map<string, Prisma.Decimal>();
  const salesByCurrency = new Map<string, Prisma.Decimal>();
  const grossProfitByCurrency = new Map<string, Prisma.Decimal>();
  for (const unit of units) {
    const total = valuationByCurrency.get(unit.currency) ?? new Prisma.Decimal(0);
    valuationByCurrency.set(unit.currency, total.plus(unit.stockValue));
    const sales = salesByCurrency.get(unit.currency) ?? new Prisma.Decimal(0);
    salesByCurrency.set(unit.currency, sales.plus(unit.salesTotal));
    const profit = grossProfitByCurrency.get(unit.currency) ?? new Prisma.Decimal(0);
    grossProfitByCurrency.set(unit.currency, profit.plus(unit.grossProfit));
  }
  const valuationSummary = valuationByCurrency.size
    ? [...valuationByCurrency.entries()].map(([currency, value]) => formatAmount(value.toString(), currency)).join(" · ")
    : "—";
  const salesSummary = salesByCurrency.size
    ? [...salesByCurrency.entries()].map(([currency, value]) => formatAmount(value.toString(), currency)).join(" · ")
    : "—";
  const grossProfitSummary = grossProfitByCurrency.size
    ? [...grossProfitByCurrency.entries()].map(([currency, value]) => formatAmount(value.toString(), currency)).join(" · ")
    : "—";
  const lowStockItems = units.flatMap((unit) =>
    unit.lowStockItems.map((item) => ({ ...item, businessUnitName: unit.name })),
  ).slice(0, 10);
  const financialMetrics = ["Purchases", "Expenses", "Receivables", "Payables"];

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-emerald-800">KUMAR BROTHERS & ASSOCIATES</p>
          <h1 className="mt-1 text-2xl font-bold">Group Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Consolidated current inventory snapshot across active business units</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="text-right text-sm">
            <p className="font-semibold">{session.user.name}</p>
            <p className="text-gray-500">{session.user.role}</p>
          </div>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Group overview</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active business units" value={units.length.toLocaleString("en-IN")} detail="Included in this snapshot" />
          <MetricCard label="Active products" value={productCount.toLocaleString("en-IN")} detail="Across active units" />
          <MetricCard label="Stock valuation" value={valuationSummary} detail="Standard stock at average cost; grouped by currency" />
        <MetricCard label="Invoiced sales" value={salesSummary} detail="All time; grouped by currency" />
        <MetricCard label="Gross profit on sales" value={grossProfitSummary} detail="Before expenses; grouped by currency" />
          <MetricCard label="Low-stock products" value={lowStockCount.toLocaleString("en-IN")} detail="At or below configured minimum" />
          <MetricCard label="Stock movements" value={movementCount.toLocaleString("en-IN")} detail="Recorded across active units" />
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Business-unit performance</h2>
          {units.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Business unit</th>
                    <th className="py-2 pr-4">Products</th>
                    <th className="py-2 pr-4">Stock value</th>
                    <th className="py-2 pr-4">Invoiced sales</th>
                    <th className="py-2 pr-4">Gross profit</th>
                    <th className="py-2 pr-4">Movements</th>
                    <th className="py-2">Low stock</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr key={unit.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium">{unit.name}</td>
                      <td className="py-3 pr-4">{unit.productCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 pr-4">{formatAmount(unit.stockValue, unit.currency)}</td>
                      <td className="py-3 pr-4">{formatAmount(unit.salesTotal, unit.currency)}</td>
                      <td className="py-3 pr-4">{formatAmount(unit.grossProfit, unit.currency)}</td>
                      <td className="py-3 pr-4">{unit.movementCount.toLocaleString("en-IN")}</td>
                      <td className="py-3">{unit.lowStockCount.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No active business units are configured.</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Other consolidated financials</h2>
          <p className="mt-1 text-sm text-gray-600">Sales and sales gross profit are shown above. Other totals need their transaction modules.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {financialMetrics.map((metric) => (
              <div key={metric} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">{metric}</p>
                <p className="mt-2 font-semibold text-gray-400">Not tracked yet</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-500">Monthly trends and net profitability are not yet available; gross profit excludes expenses and overhead.</p>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Low-stock alerts across units</h2>
            <p className="mt-1 text-sm text-gray-600">Showing up to 10 products with positive minimum-stock thresholds.</p>
          </div>
        </div>
        {lowStockItems.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr><th className="py-2 pr-4">Business unit</th><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">SKU</th><th className="py-2 pr-4">Current</th><th className="py-2">Minimum</th></tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={`${item.businessUnitName}-${item.productId}`} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{item.businessUnitName}</td>
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
          <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">No products currently meet the low-stock alert condition.</p>
        )}
      </section>
    </main>
  );
}
