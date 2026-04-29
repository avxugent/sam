import { z } from "zod";

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createWorkLogSchema = z.object({
  assetId: z.string().min(1).optional().nullable(),
  performedById: z.string().min(1).optional(),
  performedAt: isoDate.optional(),
  description: z.string().min(1, "Description is required").max(5000),
  jiraIssueKey: z
    .string()
    .regex(JIRA_KEY_REGEX, "Format: e.g. AVT-123")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const updateWorkLogSchema = createWorkLogSchema.partial();

export const createPresetSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
});

export const updatePresetSchema = createPresetSchema.partial();
