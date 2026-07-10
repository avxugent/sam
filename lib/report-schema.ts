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

const assetReportDefinitionSchema = z.object({
  source: z.literal("asset").optional(),
  filters: z.array(reportFilterSchema).max(20),
  groupBy: groupBySchema,
  columns: z.array(columnKeySchema).min(1).max(10),
});

const locationReportDefinitionSchema = z.object({
  source: z.literal("location"),
  itemIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  status: z.enum(["all", "filled", "notFilled"]),
  periodCount: z.number().int().positive().max(1000).optional(),
  periodUnit: z.enum(["days", "months", "years"]).optional(),
});

// Location schema is tried first so a `source: "location"` definition matches
// it; everything else (including legacy reports with no `source`) falls through
// to the asset schema.
export const reportDefinitionSchema = z.union([
  locationReportDefinitionSchema,
  assetReportDefinitionSchema,
]);

export const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  definition: reportDefinitionSchema,
});

export const updateReportSchema = createReportSchema.partial();
