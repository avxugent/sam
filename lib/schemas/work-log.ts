import { z } from "zod";
import { isoDay } from "@/lib/schemas/dates";

/** A Jira issue key, e.g. AVT-123. */
export const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

const workLogFields = z.object({
  assetId: z.string().min(1).optional().nullable(),
  itemId: z.string().min(1).optional().nullable(),
  performedById: z.string().min(1).optional(),
  performedAt: isoDay.optional(),
  // Optional — a fixed work-log item alone is enough to record an entry.
  // When present it must be non-empty; use null to omit it.
  description: z.string().min(1, "Description is required").max(5000).optional().nullable(),
  jiraIssueKey: z
    .string()
    .regex(JIRA_KEY_REGEX, "Format: e.g. AVT-123")
    .optional()
    .nullable()
    .or(z.literal("")),
});

// An entry needs either a fixed item or a free-text description.
export const createWorkLogSchema = workLogFields.superRefine((data, ctx) => {
  if (!data.itemId && !data.description?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["description"],
      message: "Description is required",
    });
  }
});

export const updateWorkLogSchema = workLogFields.partial();

export const createPresetSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
});

export const updatePresetSchema = createPresetSchema.partial();
