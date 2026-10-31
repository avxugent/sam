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

/**
 * What a filter field's value is. It decides the builder's value control and
 * how the engine translates the filter:
 * - reference: an id of another record (type, manufacturer, location, supplier)
 * - enum: one of a fixed set of values (asset status, criticality)
 * - text: free text on the asset or its model
 * - date: a date column, absolute or relative to today
 * - workLogItem: a fixed work-log item that has (not) been logged
 */
export type ReportFilterKind = "reference" | "enum" | "text" | "date" | "workLogItem";

const ID_OPS = ["eq", "neq", "isNull", "isNotNull"] as const;
const TEXT_OPS = ["eq", "neq", "contains", "isNull", "isNotNull"] as const;
const ITEM_OPS = ["hasItem", "notHasItem"] as const;

/** Each filter field's kind and the ops it allows, in the order the builder offers them. */
export const REPORT_FILTER_FIELDS = {
  typeId: { kind: "reference", ops: ID_OPS },
  manufacturerId: { kind: "reference", ops: ID_OPS },
  locationId: { kind: "reference", ops: ID_OPS },
  supplierId: { kind: "reference", ops: ID_OPS },
  status: { kind: "enum", ops: ["eq", "neq"] },
  criticality: { kind: "enum", ops: ID_OPS },
  model: { kind: "text", ops: TEXT_OPS },
  serialNumber: { kind: "text", ops: TEXT_OPS },
  hostname: { kind: "text", ops: TEXT_OPS },
  installationDate: { kind: "date", ops: ["before", "after", "olderThanYears", "newerThanYears", "isNull", "isNotNull"] },
  invoiceDate: { kind: "date", ops: ["before", "after", "isNull", "isNotNull"] },
  lastChanged: { kind: "date", ops: ["newerThanDays", "olderThanDays", "before", "after"] },
  endOfSupportDate: { kind: "date", ops: ["before", "after", "olderThanYears", "newerThanYears", "isNull", "isNotNull"] },
  workLogItem: { kind: "workLogItem", ops: ITEM_OPS },
  locationWorkLogItem: { kind: "workLogItem", ops: ITEM_OPS },
} as const satisfies Record<ReportFilterField, { kind: ReportFilterKind; ops: readonly FilterOp[] }>;

/** The ops a filter field allows; the first is the default when the field is picked. */
export function allowedFilterOps(field: ReportFilterField): readonly FilterOp[] {
  return REPORT_FILTER_FIELDS[field].ops;
}

/** Fields whose value is picked from a list of options rather than typed. */
export type OptionFilterField = {
  [F in ReportFilterField]: (typeof REPORT_FILTER_FIELDS)[F]["kind"] extends "reference" | "enum" | "workLogItem" ? F : never;
}[ReportFilterField];

export function isOptionFilterField(field: ReportFilterField): field is OptionFilterField {
  const { kind } = REPORT_FILTER_FIELDS[field];
  return kind === "reference" || kind === "enum" || kind === "workLogItem";
}

const RELATIVE_DATE_OPS: readonly FilterOp[] = ["olderThanYears", "newerThanYears", "newerThanDays", "olderThanDays"];

/** The value control a filter needs: none (isNull/isNotNull), a list of options, or a typed input. */
export function filterValueInput(field: ReportFilterField, op: FilterOp): "none" | "option" | "number" | "date" | "text" {
  if (op === "isNull" || op === "isNotNull") return "none";
  if (isOptionFilterField(field)) return "option";
  if (REPORT_FILTER_FIELDS[field].kind === "date") return RELATIVE_DATE_OPS.includes(op) ? "number" : "date";
  return "text";
}

const reportFilterSchema = z
  .object({
    field: filterFieldSchema,
    op: filterOpSchema,
    value: z.string().max(500).optional(),
  })
  .superRefine((filter, ctx) => {
    if (!allowedFilterOps(filter.field).includes(filter.op)) {
      ctx.addIssue({
        code: "custom",
        path: ["op"],
        message: `Filter op "${filter.op}" is not allowed for field "${filter.field}"`,
      });
    }
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
