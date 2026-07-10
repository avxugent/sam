import type { Criticality } from "@/generated/prisma/client";

export const CRITICALITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/**
 * Effective criticality of an asset: the per-asset override wins, otherwise
 * the asset type's default applies; null means unclassified.
 */
export function effectiveCriticality(
  assetCriticality: Criticality | null | undefined,
  typeDefault: Criticality | null | undefined
): Criticality | null {
  return assetCriticality ?? typeDefault ?? null;
}
