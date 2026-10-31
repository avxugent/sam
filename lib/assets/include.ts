import type { Prisma } from "@/generated/prisma/client";

/**
 * Relations of an asset as the asset table, form and detail views expect it.
 * The create, update and list endpoints all return this shape (lists add the
 * attachment count, update adds the supplier).
 */
export const ASSET_ROW_INCLUDE = {
  type: true,
  manufacturer: true,
  model: true,
  macAddresses: true,
  customFields: true,
  location: { select: { id: true, name: true } },
} satisfies Prisma.AssetInclude;

/** ASSET_ROW_INCLUDE plus the attachment count shown in asset lists. */
export const ASSET_LIST_INCLUDE = {
  ...ASSET_ROW_INCLUDE,
  _count: { select: { attachments: true } },
} satisfies Prisma.AssetInclude;

/** An asset as asset lists load it (ASSET_LIST_INCLUDE); pages pass it to client tables as-is. */
export type AssetListRow = Prisma.AssetGetPayload<{ include: typeof ASSET_LIST_INCLUDE }>;

/** Relations the asset detail page loads. */
export const ASSET_DETAIL_INCLUDE = {
  ...ASSET_ROW_INCLUDE,
  supplier: true,
  location: { select: { id: true, name: true, parentId: true } },
  attachments: {
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.AssetInclude;

export type AssetDetail = Prisma.AssetGetPayload<{ include: typeof ASSET_DETAIL_INCLUDE }>;
