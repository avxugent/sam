import { prisma } from "@/lib/prisma";
import { computeModelClusters, type ModelCountRow } from "@/lib/model-similarity";

export type ModelClusterItem = ModelCountRow & {
  id: string;
  typeName: string;
  manufacturerName: string | null;
};

/**
 * Every Model row, annotated with its own asset/stock usage count and
 * type/manufacturer names — feeds the admin "possible duplicates" panel on
 * /admin/models. Unlike the old free-text version of this helper, no raw SQL
 * is needed: `model` is a real lookup table now, so there's no collation
 * concern to work around.
 */
export async function getModelItems(): Promise<ModelClusterItem[]> {
  const models = await prisma.model.findMany({
    select: {
      id: true,
      name: true,
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      _count: { select: { assets: true, stockItems: true } },
    },
  });

  return models.map((m) => ({
    id: m.id,
    model: m.name,
    count: m._count.assets + m._count.stockItems,
    typeName: m.type.name,
    manufacturerName: m.manufacturer?.name ?? null,
  }));
}

/**
 * Fuzzy-similarity clusters of Model names, for the admin page's "possible
 * duplicates" panel. See getModelItems() for the flat, unclustered list.
 */
export async function getModelClusters(): Promise<ModelClusterItem[][]> {
  return computeModelClusters(await getModelItems());
}
