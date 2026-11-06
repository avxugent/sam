import { prisma } from "@/lib/prisma";
import type { WithInstalledUnits } from "@/lib/locations/include";

type TreeNode = { id: string; children: { id: string }[] };

/**
 * Installed units for the location detail page: summed quantity (so a box of
 * 20 batteries counts as 20) of INSTALLED assets only, since in-repair and
 * decommissioned assets are not current inventory.
 *
 * Returns the location with `installedUnits` on itself and on each child (the
 * units placed directly in it), plus the units in the whole subtree
 * (`subtreeIds`: the location and all its descendants).
 */
export async function withInstalledQuantities<L extends TreeNode>(
  location: L,
  subtreeIds: string[]
): Promise<{ location: WithInstalledUnits<L>; subtreeInstalledUnits: number }> {
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
  const units = (id: string) => unitsByLocationId.get(id) ?? 0;
  return {
    location: {
      ...location,
      installedUnits: units(location.id),
      children: location.children.map((c) => ({ ...c, installedUnits: units(c.id) })),
    },
    subtreeInstalledUnits: subtree._sum.quantity ?? 0,
  };
}
