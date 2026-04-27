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
]);

const filterFieldSchema = z.enum([
  "typeId",
  "manufacturerId",
  "locationId",
  "model",
  "serialNumber",
  "hostname",
  "installationDate",
  "invoiceDate",
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
]);

export const reportDefinitionSchema = z.object({
  filters: z.array(reportFilterSchema).max(20),
  groupBy: groupBySchema,
  columns: z.array(columnKeySchema).min(1).max(10),
});

export const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  definition: reportDefinitionSchema,
});

export const updateReportSchema = createReportSchema.partial();
