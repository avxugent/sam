import { describe, it, expect } from "vitest";
import { toLocationTab, toTheme } from "@/lib/user-preferences";

describe("toTheme()", () => {
  it("keeps a known theme and falls back to light", () => {
    expect(toTheme("dark")).toBe("dark");
    expect(toTheme("system")).toBe("system");
    expect(toTheme("purple")).toBe("light");
    expect(toTheme(null)).toBe("light");
  });
});

describe("toLocationTab()", () => {
  it("keeps a known tab and falls back to assets", () => {
    expect(toLocationTab("sublocations")).toBe("sublocations");
    expect(toLocationTab("")).toBe("assets");
    expect(toLocationTab(undefined)).toBe("assets");
  });
});
