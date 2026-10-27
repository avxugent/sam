import { describe, it, expect } from "vitest";
import { assetListStatusFilter } from "@/lib/assets/list-status";

describe("assetListStatusFilter()", () => {
  it("lists installed assets by default and for unknown values", () => {
    expect(assetListStatusFilter(null)).toEqual({ status: "INSTALLED" });
    expect(assetListStatusFilter("IN_REPAIR")).toEqual({ status: "INSTALLED" });
  });

  it("lists decommissioned assets on request", () => {
    expect(assetListStatusFilter("DECOMMISSIONED")).toEqual({ status: "DECOMMISSIONED" });
  });

  it("drops the status filter for all", () => {
    expect(assetListStatusFilter("all")).toEqual({});
  });
});
