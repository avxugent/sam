import { z } from "zod";

/** Longest lifetime a key may be given, in days. */
export const MAX_API_KEY_DAYS = 365;

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(100),
  /** Days until the key expires; omitted = never. */
  expiresInDays: z.number().int().min(1).max(MAX_API_KEY_DAYS).optional(),
});
