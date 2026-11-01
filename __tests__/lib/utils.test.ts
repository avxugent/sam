import { describe, it, expect } from "vitest";
import { cn, formatFileSize, getInitials } from "@/lib/utils";

describe("cn()", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "shown")).toBe("base shown");
  });

  it("deduplicates conflicting Tailwind classes (tailwind-merge)", () => {
    // tailwind-merge resolves conflicts: last padding wins
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles undefined and null gracefully", () => {
    expect(cn("a", undefined, null as unknown as string, "b")).toBe("a b");
  });

  it("returns empty string when no valid classes", () => {
    expect(cn(undefined, false as unknown as string)).toBe("");
  });
});

describe("formatFileSize()", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats exactly 1 KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("getInitials()", () => {
  it.each([
    ["Ada Lovelace", null, "AL"],
    ["Grace Brewster Hopper", null, "GH"],
    ["plato", null, "PL"],
    [null, "zed@x.com", "Z"],
    ["   ", "bob@x.com", "B"],
    [undefined, undefined, "U"],
  ])("%s / %s → %s", (name, email, expected) => {
    expect(getInitials(name, email)).toBe(expected);
  });
});
