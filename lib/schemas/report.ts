import { z } from "zod";

const filterOpSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "isNull",
  "isNotNull",
  "before",
  "after",
  "olderThanYears",
  "newerThanYears",
  "newerThanDays",
  "olderThanDays",
  "hasItem",
  "notHasItem",
]);

const filterFieldSchema = z.enum([
  "typeId",
  "manufacturerId",
  "locationId",
  "status",
  "model",
  "serialNumber",
  "hostname",
  "installationDate",
  "invoiceDate",
  "lastChanged",
  "workLogItem",
  "locationWorkLogItem",
  "supplierId",
  "criticality",
  "endOfSupportDate",
]);

const reportFilterSchema = z.object({
  field: filterFieldSchema,
  op: filterOpSchema,
  value: z.string().max(500).optional(),
});

const groupBySchema = z.enum([
  "type",
  "manufacturer",
  "location",
  "installationYear",
  "none",
]);

const columnKeySchema = z.enum([
  "model",
  "serialNumber",
  "hostname",
  "type",
  "manufacturer",
  "location",
  "installationDate",
  "invoiceDate",
  "invoiceNumber",
  "notes",
  "lastChanged",
  "supplier",
  "criticality",
  "endOfSupportDate",
]);

// Asset report — the original report shape. `source` is optional so existing
// saved reports (which predate the location report type) still parse as asset.
const assetReportDefinitionSchema = z.object({
  source: z.literal("asset").optional(),
  filters: z.array(reportFilterSchema).max(20),
  groupBy: groupBySchema,
  columns: z.array(columnKeySchema).min(1).max(10),
});

// Location report — a per-location coverage matrix over fixed work-log items.
// Each selected item becomes a column showing whether the leaf location has
// that item filled in (i.e. at least one work-log entry with that item).
const locationReportDefinitionSchema = z.object({
  source: z.literal("location"),
  itemIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  status: z.enum(["all", "filled", "notFilled"]),
  // Optional time window. When set, an item only counts as "filled" if its
  // most recent entry falls within the window (e.g. 1 year). Combined with
  // status "notFilled" this answers "not reviewed in the last year".
  periodCount: z.number().int().positive().max(1000).optional(),
  periodUnit: z.enum(["days", "months", "years"]).optional(),
  // Optional scope: location ids (any tree level — campus, building, floor,
  // room). When set, only leaf locations under one of these ids are included.
  // Empty/omitted means all locations.
  locationIds: z.array(z.string().min(1).max(64)).max(200).optional(),
});

// Location schema is tried first so a `source: "location"` definition matches
// it; everything else (including legacy reports with no `source`) falls through
// to the asset schema.
export const reportDefinitionSchema = z.union([
  locationReportDefinitionSchema,
  assetReportDefinitionSchema,
]);

// The report definition types are inferred from these schemas so the two
// cannot drift; lib/reports/types.ts re-exports them.
export type FilterOp = z.infer<typeof filterOpSchema>;
export type ReportFilterField = z.infer<typeof filterFieldSchema>;
export type ReportFilter = z.infer<typeof reportFilterSchema>;
export type GroupByField = z.infer<typeof groupBySchema>;
export type ColumnKey = z.infer<typeof columnKeySchema>;
export type AssetReportDefinition = z.infer<typeof assetReportDefinitionSchema>;
export type LocationReportDefinition = z.infer<typeof locationReportDefinitionSchema>;
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

/**
 * Parses a stored Report.definition (JSON text). Returns null when the text is
 * not JSON or no longer matches the schema, e.g. after a schema change.
 */
export function parseReportDefinition(stored: string): ReportDefinition | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return null;
  }
  const parsed = reportDefinitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  definition: reportDefinitionSchema,
});

export const updateReportSchema = createReportSchema.partial();
