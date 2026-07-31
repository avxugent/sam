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
  /** Installed version is at or above the baseline, confirmed recently. */
  | "compliant"
  /** Installed version is below the baseline. */
  | "outdated"
  /**
   * At or above the baseline, but the evidence has aged past the configured
   * limit. The device may have been downgraded or replaced since; treating an
   * old reading as current is how a compliance figure quietly becomes fiction.
   */
  | "stale"
  /** Both versions known, but their shapes cannot be ordered. Never "compliant". */
  | "unknown"
  /** No baseline configured for this asset type/model. */
  | "unclassified"
  /** No version ever recorded — a device with no API and no attestation. */
  | "no_data";

/** How SAM learned the installed version. */
export type FirmwareSource =
  /** Read from the device via an exporter. */
  | "REPORTED"
  /** Recorded by a person, for devices with no API to ask. */
  | "ATTESTED";

/** Default before an admin configures compliance.firmwareMaxAgeDays. */
export const DEFAULT_FIRMWARE_MAX_AGE_DAYS = 90;

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

/** True when evidence recorded at `checkedAt` is older than the limit. */
export function isStale(
  checkedAt: Date | null | undefined,
  maxAgeDays: number,
  now: Date = new Date()
): boolean {
  // Never checked is not "stale" — it is absent, which no_data covers.
  if (!checkedAt) return false;
  const ageDays = (now.getTime() - checkedAt.getTime()) / 86_400_000;
  return ageDays > maxAgeDays;
}

/**
 * Classifies one asset.
 *
 * "unclassified", "no_data" and "stale" are all deliberately distinct from
 * "compliant". A device with no baseline, a device that cannot report its
 * firmware, and a device whose last reading has aged out are each *unmeasured*
 * — reporting any of them as compliant would overstate coverage to whoever
 * reads the NIS2 figures.
 *
 * Note that staleness does **not** rescue a device that was behind: a version
 * below the baseline stays "outdated" however old the reading is. Nothing about
 * an expired reading suggests the device improved, and demoting a real
 * violation to "unmeasured" would hide it.
 */
export function firmwareStatus(
  installedVersion: string | null | undefined,
  baseline: Baseline | null,
  options: { checkedAt?: Date | null; maxAgeDays?: number; now?: Date } = {}
): FirmwareStatus {
  if (!baseline) return "unclassified";
  if (!installedVersion) return "no_data";

  const cmp = compareVersions(installedVersion, baseline.approvedVersion);
  if (cmp === null) return "unknown";
  if (cmp < 0) return "outdated";

  const maxAgeDays = options.maxAgeDays ?? DEFAULT_FIRMWARE_MAX_AGE_DAYS;
  return isStale(options.checkedAt, maxAgeDays, options.now) ? "stale" : "compliant";
}

export const FIRMWARE_STATUSES: FirmwareStatus[] = [
  "compliant",
  "outdated",
  "stale",
  "unknown",
  "unclassified",
  "no_data",
];
