import { z } from "zod";

/**
 * StockItem.metadata is JSON text carrying the identity of an asset while it
 * sits in stock (written by return-to-stock and stock create/edit, read back
 * on deploy, in the stock table and in the stock CSV export). Client-safe.
 */
const stockMetadataSchema = z
  .object({
    macAddresses: z.array(z.object({ address: z.string() })).optional(),
    customFields: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
    hostname: z.string().optional(),
    warrantyMonths: z.number().optional(),
    vaultPath: z.string().optional(),
  })
  // Keep keys this version doesn't know about when an edit rewrites the blob.
  .loose();

export type StockMetadata = z.infer<typeof stockMetadataSchema>;

/** Parsed metadata; `{}` when absent, not JSON, or not the expected shape. */
export function parseStockMetadata(raw: string | null | undefined): StockMetadata {
  if (!raw) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = stockMetadataSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

/** JSON text for the metadata column, or null when nothing worth storing is left. */
export function serializeStockMetadata(meta: StockMetadata): string | null {
  const kept = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
  );
  return Object.keys(kept).length > 0 ? JSON.stringify(kept) : null;
}

/** The MAC addresses stored in a stock item's metadata. */
export function stockMetadataMacs(raw: string | null | undefined): string[] {
  return (parseStockMetadata(raw).macAddresses ?? []).map((m) => m.address).filter(Boolean);
}
