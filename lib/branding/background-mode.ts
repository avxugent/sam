/**
 * App background (AppSetting "branding.backgroundMode"): none, a built-in
 * preset, or the uploaded custom image. Client-safe.
 */
export const BACKGROUND_MODES = ["", "preset:testing", "custom"] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Modes an admin can pick directly; "custom" is set by uploading an image. */
export const SELECTABLE_BACKGROUND_MODES = ["", "preset:testing"] as const;

/** The stored setting as a BackgroundMode; unknown or missing values mean none. */
export function parseBackgroundMode(value: string | undefined): BackgroundMode {
  return BACKGROUND_MODES.find((mode) => mode === value) ?? "";
}
