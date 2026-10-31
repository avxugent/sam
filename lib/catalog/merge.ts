import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidInput, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";

/**
 * The catalog merge and rename-conflict protocol shared by the merge routes
 * (asset types, manufacturers, models, locations), the rename (PUT) routes
 * that offer a merge on a name collision, and the admin merge UI
 * (components/admin/catalog/merge-conflict.ts, use-catalog-merge.ts). The data moves
 * themselves live with their domain (lib/models/reassign.ts, the routes).
 */

const mergeRequestSchema = z.object({ targetId: z.string().min(1) });

/**
 * Shared prelude of the "merge X into Y" routes: reads `{ targetId }`, refuses
 * a self-merge and loads both records, or returns the 400/404 to send back.
 * `noun` is used in messages ("Cannot merge a model into itself.").
 */
export async function readMergeRequest<T>(
  req: Request,
  sourceId: string,
  noun: { article: "a" | "an"; name: string },
  load: (id: string) => Promise<T | null>
): Promise<{ source: T; target: T; targetId: string } | { error: Response }> {
  const parsed = mergeRequestSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return { error: invalidInput(parsed.error) };
  const { targetId } = parsed.data;

  if (sourceId === targetId) {
    return { error: NextResponse.json({ error: `Cannot merge ${noun.article} ${noun.name} into itself.` }, { status: 400 }) };
  }
  const [source, target] = await Promise.all([load(sourceId), load(targetId)]);
  if (!source) return { error: NextResponse.json({ error: `Source ${noun.name} not found.` }, { status: 404 }) };
  // The target comes from the body: an unknown one is invalid input, not a missing page.
  if (!target) return { error: unknownReferenceResponse(`Target ${noun.name}`) };
  return { source, target, targetId };
}

/** What a merge moved to its target. Every merge endpoint reports assetsMoved. */
export type MergeCounts = {
  assetsMoved: number;
  stockItemsMoved?: number;
  modelsMoved?: number;
  /** Source models folded into a same-named model under the target. */
  modelsFolded?: number;
  sublocationsMoved?: number;
};

/** The body every merge endpoint returns. */
export type MergeResult = { ok: true } & MergeCounts;

const MERGE_COUNT_LABELS: Record<keyof MergeCounts, string> = {
  assetsMoved: "Assets moved",
  stockItemsMoved: "Stock items moved",
  modelsMoved: "Models moved",
  modelsFolded: "Models folded",
  sublocationsMoved: "Sub-locations moved",
};

export function mergeResponse(counts: MergeCounts): NextResponse {
  const body: MergeResult = { ok: true, ...counts };
  return NextResponse.json(body);
}

/** Audit detail for a merge, shown as a table in the audit log. */
export function mergeAuditDetail(targetName: string, counts: MergeCounts, extra: Record<string, string> = {}) {
  const moved = Object.entries(counts).map(([key, n]) => [MERGE_COUNT_LABELS[key as keyof MergeCounts], n]);
  return { snapshot: { "Merged into": targetName, ...Object.fromEntries(moved), ...extra } };
}

/**
 * 409 for renaming a catalog record (asset type, manufacturer, model) onto
 * the name of an existing one. `code: "nameConflict"` plus the existing
 * record lets the admin client offer a merge instead (readMergeConflict).
 */
export function nameConflictResponse(
  message: string,
  existing: { id: string; name: string; _count: { assets: number; stockItems?: number } }
) {
  const body: NameConflictBody = {
    error: message,
    code: "nameConflict",
    existingId: existing.id,
    existingName: existing.name,
    existingAssetCount: existing._count.assets,
    ...(existing._count.stockItems !== undefined && { existingStockCount: existing._count.stockItems }),
  };
  return NextResponse.json(body, { status: 409 });
}

/** The 409 body nameConflictResponse() sends; read on the client by readMergeConflict(). */
export type NameConflictBody = {
  error: string;
  code: "nameConflict";
  existingId: string;
  existingName: string;
  existingAssetCount: number;
  /** Only for records that stock items reference (models). */
  existingStockCount?: number;
};
