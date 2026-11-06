import { describe, it, expect } from "vitest";
import { parseStockMetadata, serializeStockMetadata, stockMetadataMacs } from "@/lib/stock-metadata";

describe("parseStockMetadata()", () => {
  it("returns {} for missing, malformed or wrongly shaped metadata", () => {
    expect(parseStockMetadata(null)).toEqual({});
    expect(parseStockMetadata("{oops")).toEqual({});
    expect(parseStockMetadata(JSON.stringify({ macAddresses: "AA:BB" }))).toEqual({});
  });

  it("keeps known fields and unknown extra keys", () => {
    const raw = JSON.stringify({ hostname: "pc1", warrantyMonths: 24, futureKey: 1 });
    expect(parseStockMetadata(raw)).toEqual({ hostname: "pc1", warrantyMonths: 24, futureKey: 1 });
  });
});

describe("serializeStockMetadata()", () => {
  it("drops empty and missing values and returns null when nothing is left", () => {
    expect(serializeStockMetadata({ macAddresses: [], hostname: undefined })).toBeNull();
    expect(JSON.parse(serializeStockMetadata({ macAddresses: [{ address: "AA" }], customFields: [] })!)).toEqual({
      macAddresses: [{ address: "AA" }],
    });
  });
});

describe("stockMetadataMacs()", () => {
  it("lists the stored MAC addresses", () => {
    const raw = JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }, { address: "" }] });
    expect(stockMetadataMacs(raw)).toEqual(["AA:BB:CC:DD:EE:FF"]);
    expect(stockMetadataMacs(null)).toEqual([]);
  });
});
