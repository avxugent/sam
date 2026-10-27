import { distance } from "fastest-levenshtein";

/**
 * Comparison key only — never mutates the stored/displayed spelling.
 * Case-folds, collapses any run of non-letter/non-digit characters
 * (punctuation, hyphens, extra whitespace) to a single space, and trims.
 * "PowerEdge R740", "poweredge r740" and "PowerEdge  R740" all normalize to
 * "poweredge r740".
 */
export function normalizeModelName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// A pair of normalized model names counts as "similar" when their edit
// distance is strictly less than 25% of the longer string's length. A
// single-character difference in a short bare token (e.g. "r740" vs "r750":
// distance 1 / length 4 = 0.25) sits at the threshold and is excluded, since
// that's the most common shape of "two different real model numbers".
export const SIMILARITY_RATIO_THRESHOLD = 0.25;

/**
 * Distance between two already-normalized keys if they should be treated as
 * similar, or null if they shouldn't. Distance 0 means the normalized keys
 * are identical (a pure formatting difference).
 *
 * Guards against flagging genuinely different model numbers (e.g. "dell
 * poweredge r740" vs "dell poweredge r750") as similar: the ratio check
 * alone would flag this pair (distance 1 over a much longer string), so
 * when both keys contain digits and those digit sequences differ, the pair
 * is never similar regardless of ratio — a changed digit is treated as a
 * different real-world model, not a typo.
 */
export function similarityDistance(normA: string, normB: string): number | null {
  if (!normA || !normB) return null;
  const d = distance(normA, normB);
  if (d === 0) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  if (d / maxLen >= SIMILARITY_RATIO_THRESHOLD) return null;

  const digitsA = normA.replace(/\D/g, "");
  const digitsB = normB.replace(/\D/g, "");
  if (digitsA && digitsB && digitsA !== digitsB) return null;

  return d;
}

export type SimilarModelMatch = { model: string; distance: number };

/**
 * Finds the closest existing model name to `candidate`. Returns null when
 * `candidate` is already an exact (raw) match for one of `existingModels`
 * (nothing to suggest), or when nothing is close enough per
 * similarityDistance().
 */
export function findSimilarModel(
  candidate: string,
  existingModels: string[]
): SimilarModelMatch | null {
  const normCandidate = normalizeModelName(candidate);
  if (!normCandidate) return null;

  let best: SimilarModelMatch | null = null;
  for (const existing of existingModels) {
    if (existing === candidate) continue;
    const d = similarityDistance(normCandidate, normalizeModelName(existing));
    if (d === null) continue;
    if (!best || d < best.distance) best = { model: existing, distance: d };
  }
  return best;
}

export type ModelCountRow = { model: string; count: number };

/**
 * Groups {model, count} rows into clusters of 2+ mutually-similar spellings
 * (union-find over pairwise similarityDistance()). Used by the admin
 * "Model Cleanup" page/API to surface fuzzy-but-not-exact duplicates for
 * manual review. Generic so callers can pass richer rows (e.g. with type/
 * manufacturer context attached) and get them back unchanged, grouped.
 */
export function computeModelClusters<T extends ModelCountRow>(items: T[]): T[][] {
  const parent = items.map((_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  const normalized = items.map((it) => normalizeModelName(it.model));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (similarityDistance(normalized[i], normalized[j]) !== null) {
        const ra = find(i);
        const rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }

  const groups = new Map<number, T[]>();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(it);
  });

  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => [...g].sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)));
}
