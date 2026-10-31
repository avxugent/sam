import { prisma } from "@/lib/prisma";

type CountedLocation = { id: string; _count: { assets: number } };

/**
 * Asset counts for the location detail page, in physical units (summed
 * quantity, so a box of 20 batteries counts as 20) of INSTALLED assets only:
 * in-repair and decommissioned assets are not current inventory.
 *
 * Returns the location with `_count.assets` of itself and of each child
 * replaced by the units placed directly in it, plus the units in the whole
 * subtree (`subtreeIds`: the location and all its descendants).
 */
export async function withInstalledQuantities<L extends CountedLocation & { children: CountedLocation[] }>(
  location: L,
  subtreeIds: string[]
): Promise<{ location: L; subtreeAssetCount: number }> {
  const [subtree, direct] = await Promise.all([
    prisma.asset.aggregate({
      where: { locationId: { in: subtreeIds }, status: "INSTALLED" },
      _sum: { quantity: true },
    }),
    prisma.asset.groupBy({
      by: ["locationId"],
      where: { locationId: { in: [location.id, ...location.children.map((c) => c.id)] }, status: "INSTALLED" },
      _sum: { quantity: true },
    }),
  ]);
  const unitsByLocationId = new Map(direct.map((r) => [r.locationId, r._sum.quantity ?? 0]));
  const withUnits = <T extends CountedLocation>(l: T): T => ({
    ...l,
    _count: { ...l._count, assets: unitsByLocationId.get(l.id) ?? 0 },
  });
  return {
    location: { ...withUnits(location), children: location.children.map(withUnits) },
    subtreeAssetCount: subtree._sum.quantity ?? 0,
  };
}
