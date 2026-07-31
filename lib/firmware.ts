/**
 * Firmware currency: comparing the version a device reports against the version
 * SAM says it should be running.
 *
 * The comparison lives here rather than in PromQL because PromQL cannot order
 * version strings, and because NIS2 wants an auditable record in the database
 * rather than a number reconstructed from a dashboard.
 *
 * A device is compliant when its installed version is at or above the baseline.
 * A device ahead of the baseline is not flagged, so a rollout in progress does
 * not light up the dashboard — the tradeoff is that an untested newer build
 * looks fine.
 */

export type FirmwareStatus =
  /** Installed version is at or above the baseline. */
  | "compliant"
  /** Installed version is below the baseline. */
  | "outdated"
  /** Both versions known, but their shapes cannot be ordered. Never "compliant". */
  | "unknown"
  /** No baseline configured for this asset type/model. */
  | "unclassified"
  /** No version reported — a device with no API, or one that is unreachable. */
  | "no_data";

export type Baseline = {
  typeId: string;
  /** null applies to every model of the type. */
  model: string | null;
  approvedVersion: string;
};

/**
 * Splits a version into comparable segments.
 *
 * AV firmware is not semver: Pearl ships "4.18.1", Crestron "1.0.0.1234", some
 * vendors "v2.3-build17". Splitting on every run of digits (and keeping the
 * words between them) handles all of those without a grammar.
 */
function segments(version: string): Array<{ num: number } | { word: string }> {
  const cleaned = version.trim().replace(/^[vV](?=\d)/, "");
  const out: Array<{ num: number } | { word: string }> = [];
  for (const token of cleaned.split(/[.\-_+\s]+/)) {
    if (!token) continue;
    // "build17" → word "build", number 17
    for (const part of token.match(/\d+|\D+/g) ?? []) {
      if (/^\d+$/.test(part)) out.push({ num: parseInt(part, 10) });
      else out.push({ word: part.toLowerCase() });
    }
  }
  return out;
}

/**
 * Orders two version strings.
 *
 * Returns a negative number when `a` sorts before `b`, positive when after,
 * 0 when equal, and **null when the two cannot be meaningfully ordered** — a
 * numeric segment against a word, for instance ("2.3" vs "2.beta").
 *
 * Callers must treat null as *unknown*, never as compliant. Guessing is how a
 * device silently drops out of the outdated count.
 *
 * Caveat: numeric segments compare as integers, so a vendor using fixed-width
 * zero-padded parts ("1.08") mixed with unpadded ones ("1.6") would order
 * 1.08 above 1.6. Mixing widths is itself unusual; if a vendor does it, give
 * that model its own baseline rather than relying on the ordering.
 */
export function compareVersions(a: string, b: string): number | null {
  const sa = segments(a);
  const sb = segments(b);
  const len = Math.max(sa.length, sb.length);

  for (let i = 0; i < len; i++) {
    // A missing trailing segment reads as zero, so "4.18" == "4.18.0".
    const x = sa[i] ?? { num: 0 };
    const y = sb[i] ?? { num: 0 };

    if ("num" in x && "num" in y) {
      if (x.num !== y.num) return x.num - y.num;
      continue;
    }
    if ("word" in x && "word" in y) {
      if (x.word !== y.word) return x.word < y.word ? -1 : 1;
      continue;
    }
    // One is a number and the other a word: no defensible ordering.
    return null;
  }
  return 0;
}

/**
 * Picks the baseline that applies to an asset. Most specific wins: a row naming
 * the exact model beats the type-wide row.
 */
export function matchBaseline(
  baselines: Baseline[],
  typeId: string | null,
  model: string | null
): Baseline | null {
  if (!typeId) return null;
  const forType = baselines.filter((b) => b.typeId === typeId);
  return (
    forType.find((b) => b.model != null && model != null && b.model === model) ??
    forType.find((b) => b.model == null) ??
    null
  );
}

/**
 * Classifies one asset.
 *
 * "unclassified" and "no_data" are deliberately distinct from "compliant":
 * a device with no baseline and a device that cannot report its firmware are
 * both *unmeasured*, and reporting them as compliant would overstate coverage
 * to anyone reading the NIS2 figures.
 */
export function firmwareStatus(
  installedVersion: string | null | undefined,
  baseline: Baseline | null
): FirmwareStatus {
  if (!baseline) return "unclassified";
  if (!installedVersion) return "no_data";

  const cmp = compareVersions(installedVersion, baseline.approvedVersion);
  if (cmp === null) return "unknown";
  return cmp >= 0 ? "compliant" : "outdated";
}

export const FIRMWARE_STATUSES: FirmwareStatus[] = [
  "compliant",
  "outdated",
  "unknown",
  "unclassified",
  "no_data",
];
