import { z } from "zod";

/**
 * Grafana SimpleJSON request bodies (/api/grafana/*). Unknown fields Grafana
 * sends (range, interval, panelId, …) are kept but ignored.
 */

/** Ad-hoc filter keys: offered by tag-keys, listed by tag-values, applied by query. */
export const ADHOC_FILTER_KEYS = ["type", "manufacturer", "location", "hostname"] as const;
export type AdhocFilterKey = (typeof ADHOC_FILTER_KEYS)[number];

export const grafanaQuerySchema = z
  .object({
    targets: z.array(z.object({ target: z.string().max(100) }).loose()).max(50).default([]),
    adhocFilters: z
      .array(z.object({ key: z.string().max(50), operator: z.string().max(10), value: z.string().max(255) }).loose())
      .max(50)
      .default([]),
  })
  .loose();

export type AdhocFilter = z.infer<typeof grafanaQuerySchema>["adhocFilters"][number];

export const grafanaTagValuesSchema = z.object({ key: z.string().max(50) }).loose();
