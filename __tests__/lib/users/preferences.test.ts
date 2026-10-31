import { describe, it, expect } from "vitest";
import { parseLocationTab, parseTheme } from "@/lib/users/preferences";

describe("parseTheme()", () => {
  it("keeps a known theme and falls back to light", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("purple")).toBe("light");
    expect(parseTheme(null)).toBe("light");
  });
});

describe("parseLocationTab()", () => {
  it("keeps a known tab and falls back to assets", () => {
    expect(parseLocationTab("sublocations")).toBe("sublocations");
    expect(parseLocationTab("")).toBe("assets");
    expect(parseLocationTab(undefined)).toBe("assets");
  });
});
