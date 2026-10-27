import { prisma } from "@/lib/prisma";
import { computeModelClusters, type ModelCountRow } from "@/lib/models/similarity";

export type ModelClusterItem = ModelCountRow & {
  id: string;
  typeId: string;
  typeName: string;
  manufacturerName: string | null;
};

/**
 * Every Model row, annotated with its own asset/stock usage count and
 * type/manufacturer names — feeds the admin "possible duplicates" panel on
 * /admin/models.
 */
export async function getModelItems(): Promise<ModelClusterItem[]> {
  const models = await prisma.model.findMany({
    select: {
      id: true,
      name: true,
      typeId: true,
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      // Decommissioned assets are historical, not current inventory — excluded
      // so a retired spelling never outranks an actively-used one as the merge target.
      _count: { select: { assets: { where: { status: "INSTALLED" } }, stockItems: true } },
    },
  });

  return models.map((m) => ({
    id: m.id,
    model: m.name,
    count: m._count.assets + m._count.stockItems,
    typeId: m.typeId,
    typeName: m.type.name,
    manufacturerName: m.manufacturer?.name ?? null,
  }));
}

/**
 * Fuzzy-similarity clusters of Model names, for the admin page's "possible
 * duplicates" panel. See getModelItems() for the flat, unclustered list.
 * Clustered per asset type — a Model is scoped to exactly one type, so the
 * same (or similar) name under a different type is a legitimate distinct
 * catalog entry, never a duplicate to merge.
 */
export async function getModelClusters(): Promise<ModelClusterItem[][]> {
  const items = await getModelItems();
  const byType = new Map<string, ModelClusterItem[]>();
  for (const item of items) {
    const bucket = byType.get(item.typeId);
    if (bucket) bucket.push(item);
    else byType.set(item.typeId, [item]);
  }
  return [...byType.values()].flatMap((bucket) => computeModelClusters(bucket));
}
