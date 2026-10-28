import type { Prisma } from "@/generated/prisma/client";

/**
 * Moves every Model of a merged-away asset type or manufacturer onto the
 * merge target. Models are unique per (typeId, manufacturerId, name), so a
 * source model whose name already exists under the target is folded into that
 * model (its assets and stock repointed, the source model deleted) instead of
 * moved. Without this, deleting the source type fails on the RESTRICT foreign
 * key, and deleting the source manufacturer silently nulls the models' brand.
 *
 * Returns how many source models were moved and how many were folded.
 */
export async function reassignModels(
  tx: Prisma.TransactionClient,
  from: { typeId: string } | { manufacturerId: string },
  to: { typeId: string } | { manufacturerId: string }
): Promise<{ modelsMoved: number; modelsFolded: number }> {
  const sources = await tx.model.findMany({ where: from, select: { id: true, name: true, typeId: true, manufacturerId: true } });
  let modelsMoved = 0;
  let modelsFolded = 0;

  for (const source of sources) {
    const destination = { typeId: source.typeId, manufacturerId: source.manufacturerId, ...to };
    const existing = await tx.model.findFirst({ where: { ...destination, name: source.name }, select: { id: true } });
    if (existing) {
      await tx.asset.updateMany({ where: { modelId: source.id }, data: { modelId: existing.id } });
      await tx.stockItem.updateMany({ where: { modelId: source.id }, data: { modelId: existing.id } });
      await tx.model.delete({ where: { id: source.id } });
      modelsFolded++;
    } else {
      await tx.model.update({ where: { id: source.id }, data: to });
      modelsMoved++;
    }
  }

  return { modelsMoved, modelsFolded };
}
