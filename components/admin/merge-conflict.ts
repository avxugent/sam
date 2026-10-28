/**
 * Rename-onto-an-existing-name handling shared by the catalog admin clients
 * (asset types, manufacturers, models). The PUT routes answer such a rename
 * with nameConflictResponse() (lib/route-helpers.ts); the client then offers
 * to merge the edited record into the existing one.
 */
export type MergeConflict = {
  editingId: string;
  newName: string;
  existingId: string;
  existingName: string;
  existingAssetCount: number;
  existingStockCount: number;
};

type ConflictBody = {
  code?: string;
  existingId?: string;
  existingName?: string;
  existingAssetCount?: number;
  existingStockCount?: number;
};

/** The merge offer in an error body, or null when the error is something else. */
export function readMergeConflict(err: ConflictBody, editingId: string, newName: string): MergeConflict | null {
  if (err.code !== "nameConflict" || !err.existingId) return null;
  return {
    editingId,
    newName,
    existingId: err.existingId,
    existingName: err.existingName ?? newName,
    existingAssetCount: err.existingAssetCount ?? 0,
    existingStockCount: err.existingStockCount ?? 0,
  };
}
