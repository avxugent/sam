import { Criticality } from "@/generated/prisma/enums";

/** Criticality levels in ascending order (the Prisma enum's declaration order). */
export const CRITICALITY_VALUES = Object.values(Criticality);

/** `value` as a Criticality level, or null when it is not one. */
export function parseCriticality(value: string): Criticality | null {
  return CRITICALITY_VALUES.find((level) => level === value) ?? null;
}

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
