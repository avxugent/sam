import { describe, it, expect } from "vitest";
import { formatDate, toIsoDay } from "@/lib/dates";

describe("formatDate()", () => {
  it("formats a Date object", () => {
    const d = new Date("2024-01-15");
    expect(formatDate(d)).toMatch(/15/);
    expect(formatDate(d)).toMatch(/Jan/);
    expect(formatDate(d)).toMatch(/2024/);
  });

  it("formats an ISO date string", () => {
    expect(formatDate("2023-06-01")).toMatch(/2023/);
  });

  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });
});

describe("toIsoDay()", () => {
  it("formats dates, ISO strings and timestamps as the UTC day", () => {
    expect(toIsoDay(new Date("2024-03-09T23:30:00Z"))).toBe("2024-03-09");
    expect(toIsoDay("2024-03-09T10:00:00.000Z")).toBe("2024-03-09");
    expect(toIsoDay(Date.UTC(2024, 0, 31))).toBe("2024-01-31");
  });

  it("passes null and undefined through as null", () => {
    expect(toIsoDay(null)).toBeNull();
    expect(toIsoDay(undefined)).toBeNull();
  });
});
