import type { Prisma } from "@/generated/prisma/client";

/** Relations of a location as GET /api/locations/[id] returns it. */
export const LOCATION_DETAIL_INCLUDE = {
  parent: { select: { id: true, name: true, parentId: true } },
  children: {
    include: { _count: { select: { assets: true, children: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  },
  _count: { select: { assets: true, children: true, attachments: true } },
} satisfies Prisma.LocationInclude;

/** LOCATION_DETAIL_INCLUDE plus the attachments, as the location page loads it. */
export const LOCATION_PAGE_INCLUDE = {
  ...LOCATION_DETAIL_INCLUDE,
  attachments: {
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.LocationInclude;

/**
 * A location and its children, each with the units of INSTALLED assets placed
 * directly in it (summed quantity; `_count.assets` stays the asset-row count).
 */
export type WithInstalledUnits<L extends { children: object[] }> = Omit<L, "children"> & {
  installedUnits: number;
  children: (L["children"][number] & { installedUnits: number })[];
};

/** A location as the page passes it to LocationDetailClient. */
export type LocationPageData = WithInstalledUnits<Prisma.LocationGetPayload<{ include: typeof LOCATION_PAGE_INCLUDE }>>;
