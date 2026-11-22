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
  const existing = await tx.product.findMany({
    where: { businessUnitId, sku: { startsWith: prefix } },
    select: { sku: true },
  });
  const maxNumber = existing.reduce((max, product) => {
    const match = product.sku.match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = maxNumber + 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}
