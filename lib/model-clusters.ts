import { prisma } from "@/lib/prisma";
import { computeModelClusters, type ModelCountRow } from "@/lib/model-similarity";

export type ModelClusterItem = ModelCountRow & { types: string[]; manufacturers: string[] };

/**
 * Every distinct Asset.model spelling, annotated with the distinct asset
 * type and manufacturer names seen for it — context to tell apart
 * genuinely different products that happen to have a small edit distance
 * (e.g. "DTP HDMI 4K 230 RX" vs "...TX") from real formatting variants.
 */
export async function getModelItems(): Promise<ModelClusterItem[]> {
  const [rows, types, manufacturers] = await Promise.all([
    prisma.asset.groupBy({
      by: ["model", "typeId", "manufacturerId"],
      where: { model: { not: null } },
      _count: { id: true },
    }),
    prisma.assetType.findMany({ select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),
  ]);

  const typeNameById = new Map(types.map((t) => [t.id, t.name]));
  const manufacturerNameById = new Map(manufacturers.map((m) => [m.id, m.name]));

  const byModel = new Map<string, { count: number; types: Set<string>; manufacturers: Set<string> }>();
  for (const row of rows) {
    const model = row.model as string;
    if (!byModel.has(model)) {
      byModel.set(model, { count: 0, types: new Set(), manufacturers: new Set() });
    }
    const entry = byModel.get(model)!;
    entry.count += row._count.id;
    if (row.typeId) {
      const name = typeNameById.get(row.typeId);
      if (name) entry.types.add(name);
    }
    if (row.manufacturerId) {
      const name = manufacturerNameById.get(row.manufacturerId);
      if (name) entry.manufacturers.add(name);
    }
  }

  return [...byModel.entries()].map(([model, v]) => ({
    model,
    count: v.count,
    types: [...v.types].sort(),
    manufacturers: [...v.manufacturers].sort(),
  }));
}

/**
 * Fuzzy-similarity clusters of Asset.model spellings, for the admin "Model
 * Cleanup" page's duplicate-detection view. See getModelItems() for the
 * flat, unclustered list (used for direct search-and-rename).
 */
export async function getModelClusters(): Promise<ModelClusterItem[][]> {
  return computeModelClusters(await getModelItems());
}
