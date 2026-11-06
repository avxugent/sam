import { describe, it, expect } from "vitest";
import { ADHOC_FILTER_KEYS, grafanaQuerySchema, grafanaTagValuesSchema } from "@/lib/schemas/grafana";

describe("ADHOC_FILTER_KEYS", () => {
  it("lists the four filter keys", () => {
    expect(ADHOC_FILTER_KEYS).toEqual(["type", "manufacturer", "location", "hostname"]);
  });
});

describe("grafanaQuerySchema", () => {
  it("defaults targets and adhocFilters to empty arrays", () => {
    expect(grafanaQuerySchema.parse({})).toEqual({ targets: [], adhocFilters: [] });
  });

  it("accepts a typical Grafana body and keeps unknown fields", () => {
    const body = {
      range: { from: "2026-01-01", to: "2026-01-02" },
      panelId: 3,
      targets: [{ target: "assets", refId: "A", type: "table" }],
      adhocFilters: [{ key: "type", operator: "=", value: "Server", condition: "AND" }],
    };
    const parsed = grafanaQuerySchema.parse(body);
    expect(parsed).toEqual(body);
  });

  it("rejects a non-object body", () => {
    expect(grafanaQuerySchema.safeParse(null).success).toBe(false);
    expect(grafanaQuerySchema.safeParse("x").success).toBe(false);
  });

  it("rejects targets without a string target", () => {
    expect(grafanaQuerySchema.safeParse({ targets: [{}] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ targets: [{ target: 1 }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ targets: "assets" }).success).toBe(false);
  });

  it("caps target length at 100 and the targets list at 50", () => {
    expect(grafanaQuerySchema.safeParse({ targets: [{ target: "a".repeat(100) }] }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ targets: [{ target: "a".repeat(101) }] }).success).toBe(false);
    const many = (n: number) => Array.from({ length: n }, () => ({ target: "t" }));
    expect(grafanaQuerySchema.safeParse({ targets: many(50) }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ targets: many(51) }).success).toBe(false);
  });

  it("requires key, operator and value on each ad-hoc filter", () => {
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ key: "type", operator: "=" }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ key: "type", value: "x" }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ operator: "=", value: "x" }] }).success).toBe(false);
  });

  it("caps ad-hoc filter field lengths and count", () => {
    const f = { key: "type", operator: "=", value: "x" };
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, key: "k".repeat(50) }] }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, key: "k".repeat(51) }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, operator: "=".repeat(10) }] }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, operator: "=".repeat(11) }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, value: "v".repeat(255) }] }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ ...f, value: "v".repeat(256) }] }).success).toBe(false);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: Array(50).fill(f) }).success).toBe(true);
    expect(grafanaQuerySchema.safeParse({ adhocFilters: Array(51).fill(f) }).success).toBe(false);
  });

  it("does not restrict the filter key to ADHOC_FILTER_KEYS (routes ignore unknown keys)", () => {
    expect(grafanaQuerySchema.safeParse({ adhocFilters: [{ key: "serial", operator: "=", value: "x" }] }).success).toBe(true);
  });
});

describe("grafanaTagValuesSchema", () => {
  it("accepts a key and keeps unknown fields", () => {
    expect(grafanaTagValuesSchema.parse({ key: "type", extra: 1 })).toEqual({ key: "type", extra: 1 });
  });

  it("rejects a missing, non-string or over-long key", () => {
    expect(grafanaTagValuesSchema.safeParse({}).success).toBe(false);
    expect(grafanaTagValuesSchema.safeParse({ key: 5 }).success).toBe(false);
    expect(grafanaTagValuesSchema.safeParse({ key: "k".repeat(50) }).success).toBe(true);
    expect(grafanaTagValuesSchema.safeParse({ key: "k".repeat(51) }).success).toBe(false);
  });
});
