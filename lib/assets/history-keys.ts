/**
 * Snapshot keys of the asset/stock audit entries that mark a lifecycle event.
 * lib/assets/transitions.ts writes them and the asset history timeline reads
 * them to tell e.g. a deploy from a manual create (both are CREATE entries).
 * They are also the labels shown in the audit log, and existing rows carry
 * them, so a key may be added but never renamed. Client-safe.
 */
export const HISTORY_SNAPSHOT_KEYS = {
  /** Asset CREATE: deployed from a stock item (value: model name). */
  deployedFromStock: "Deployed from stock",
  /** Asset DELETE: returned to stock (value: model name). */
  returnedToStock: "Returned to stock",
  /** StockItem CREATE: came back from an asset (value: its location). */
  returnedFromAssetAt: "Returned from asset at",
  /** StockItem UPDATE / DELETE: units deployed (value: the count). */
  deployedQuantity: "Deployed quantity",
} as const;

/**
 * Change labels (keys of an audit entry's `detail.changes`) the timeline
 * reads, under the same never-rename rule. Asset status transitions are
 * read from `detail.status`, an AssetStatus value.
 */
export const HISTORY_CHANGE_LABELS = {
  /** StockItem UPDATE: moved to another location (app/api/stock/bulk-relocate). */
  location: "Location",
} as const;
