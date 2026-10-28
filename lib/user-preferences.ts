/**
 * Closed sets for the per-user preference columns (User.theme and
 * User.locationDefaultTab are plain strings in the schema). Client-safe; the
 * users/me API validates against these and readers narrow stored values here.
 */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const LOCATION_TABS = ["assets", "sublocations"] as const;
export type LocationTab = (typeof LOCATION_TABS)[number];

/** A stored theme value, falling back to "light" for anything unknown. */
export function toTheme(value: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
}

/** A stored location tab value, falling back to "assets" for anything unknown. */
export function toLocationTab(value: string | null | undefined): LocationTab {
  return (LOCATION_TABS as readonly string[]).includes(value ?? "") ? (value as LocationTab) : "assets";
}
