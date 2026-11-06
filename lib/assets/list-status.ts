import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AssetStatus } from "@/generated/prisma/enums";
import { invalidInput } from "@/lib/route-helpers";

const statusParam = z.enum(["all", ...Object.values(AssetStatus)]).optional();

/**
 * The `?status=` filter shared by the asset list endpoints: installed assets by
 * default, an AssetStatus value for that status, `all` for every status; any
 * other value is a 400. (Returned-to-stock assets are deleted, not
 * decommissioned, so they never appear.)
 */
export function assetListStatusFilter(
  param: string | null
): { where: Prisma.AssetWhereInput } | { error: Response } {
  const parsed = statusParam.safeParse(param ?? undefined);
  if (!parsed.success) return { error: invalidInput(parsed.error) };
  if (parsed.data === "all") return { where: {} };
  return { where: { status: parsed.data ?? "INSTALLED" } };
}
