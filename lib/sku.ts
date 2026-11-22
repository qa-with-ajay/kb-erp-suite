import { Prisma } from "@prisma/client";

function categoryPrefix(name: string | null) {
  if (!name) return "GEN";
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.slice(0, 3) || "GEN";
}

export async function generateProductSku(
  tx: Prisma.TransactionClient,
  businessUnitId: string,
  categoryId: string | null,
) {
  const category = categoryId
    ? await tx.category.findFirst({ where: { id: categoryId, businessUnitId }, select: { name: true } })
    : null;
  const prefix = `KB-${categoryPrefix(category?.name ?? null)}-`;

  // Serialize SKU allocation for this business unit and prefix.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessUnitId}), hashtext(${prefix}))`;
  const latest = await tx.product.findFirst({
    where: { businessUnitId, sku: { startsWith: prefix } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const match = latest?.sku.match(/-(\\d+)$/);
  const nextNumber = (match ? Number(match[1]) : 0) + 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}
