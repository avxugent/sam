import { describe, it, expect } from "vitest";
import { assetListStatusFilter } from "@/lib/assets/list-status";

describe("assetListStatusFilter()", () => {
  it("lists installed assets by default", () => {
    expect(assetListStatusFilter(null)).toEqual({ where: { status: "INSTALLED" } });
  });

  it("lists the requested status", () => {
    expect(assetListStatusFilter("DECOMMISSIONED")).toEqual({ where: { status: "DECOMMISSIONED" } });
    expect(assetListStatusFilter("IN_REPAIR")).toEqual({ where: { status: "IN_REPAIR" } });
    expect(assetListStatusFilter("INSTALLED")).toEqual({ where: { status: "INSTALLED" } });
  });

  it("drops the status filter for all", () => {
    expect(assetListStatusFilter("all")).toEqual({ where: {} });
  });

  it("rejects an unknown value with a 400", async () => {
    const result = assetListStatusFilter("installed");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.status).toBe(400);
    expect((await result.error.json()).error).toBe("Invalid input");
  });
});
