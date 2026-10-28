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
