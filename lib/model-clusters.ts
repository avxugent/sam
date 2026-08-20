import { prisma } from "@/lib/prisma";
import { computeModelClusters, type ModelCountRow } from "@/lib/model-similarity";

export type ModelClusterItem = ModelCountRow & { types: string[]; manufacturers: string[] };

type ModelGroupRow = {
  model: string;
  typeId: string | null;
  manufacturerId: string | null;
  count: bigint;
};

/**
 * Every distinct Asset.model spelling, annotated with the distinct asset
 * type and manufacturer names seen for it — context to tell apart
 * genuinely different products that happen to have a small edit distance
 * (e.g. "DTP HDMI 4K 230 RX" vs "...TX") from real formatting variants.
 *
 * Grouped with `BINARY model` (raw SQL, not Prisma's groupBy): the assets
 * table's default collation (utf8mb4_unicode_ci) is case-insensitive, so a
 * plain `GROUP BY model` would silently merge spellings that differ only in
 * case (e.g. "PowerEdge R740" / "poweredge r740") before they ever reach the
 * clustering step below — hiding exactly the duplicates this page exists to
 * surface.
 */
export async function getModelItems(): Promise<ModelClusterItem[]> {
  const [rows, types, manufacturers] = await Promise.all([
    prisma.$queryRaw<ModelGroupRow[]>`
      SELECT ANY_VALUE(model) AS model, typeId, manufacturerId, COUNT(*) AS count
      FROM assets
      WHERE model IS NOT NULL
      GROUP BY BINARY model, typeId, manufacturerId
    `,
    prisma.assetType.findMany({ select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),
  ]);

  const typeNameById = new Map(types.map((t) => [t.id, t.name]));
  const manufacturerNameById = new Map(manufacturers.map((m) => [m.id, m.name]));

  const byModel = new Map<string, { count: number; types: Set<string>; manufacturers: Set<string> }>();
  for (const row of rows) {
    const model = row.model;
    if (!byModel.has(model)) {
      byModel.set(model, { count: 0, types: new Set(), manufacturers: new Set() });
    }
    const entry = byModel.get(model)!;
    entry.count += Number(row.count);
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
