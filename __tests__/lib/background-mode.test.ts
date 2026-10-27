import { describe, it, expect } from "vitest";
import { parseBackgroundMode, SELECTABLE_BACKGROUND_MODES, BACKGROUND_MODES } from "@/lib/background-mode";

describe("parseBackgroundMode()", () => {
  it.each(BACKGROUND_MODES)("keeps the known mode %j", (mode) => {
    expect(parseBackgroundMode(mode)).toBe(mode);
  });

  it("treats a missing or unknown stored value as no background", () => {
    expect(parseBackgroundMode(undefined)).toBe("");
    expect(parseBackgroundMode("preset:unknown")).toBe("");
  });

  it("lets admins pick every mode except the upload-only custom one", () => {
    expect(SELECTABLE_BACKGROUND_MODES).toEqual(BACKGROUND_MODES.filter((m) => m !== "custom"));
  });
});
