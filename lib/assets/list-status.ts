import type { Prisma } from "@/generated/prisma/client";

/**
 * The `?status=` filter shared by the asset list endpoints: installed assets by
 * default, `DECOMMISSIONED` for decommissioned ones, `all` for every status.
 * (Returned-to-stock assets are deleted, not decommissioned, so they never
 * appear.)
 */
export function assetListStatusFilter(param: string | null): Prisma.AssetWhereInput {
  if (param === "all") return {};
  if (param === "DECOMMISSIONED") return { status: "DECOMMISSIONED" };
  return { status: "INSTALLED" };
}
