import { describe, it, expect } from "vitest";
import { createAssetSchema, updateAssetSchema, MAX_CUSTOM_FIELDS } from "@/lib/asset-schema";
import { MAX_MAC_ADDRESSES } from "@/lib/mac-address";

const base = { typeId: "t1", manufacturerId: "m1", modelId: "mo1" };

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("createAssetSchema", () => {
  it("defaults quantity to 1 and normalizes MAC addresses", () => {
    const parsed = createAssetSchema.parse({ ...base, macAddresses: ["aa-bb-cc-dd-ee-ff"] });
    expect(parsed.quantity).toBe(1);
    expect(parsed.macAddresses).toEqual(["AA:BB:CC:DD:EE:FF"]);
  });

  it("rejects an unrecoverable MAC", () => {
    expect(issuePaths(createAssetSchema.safeParse({ ...base, macAddresses: ["nope"] }))).toEqual(["macAddresses.0"]);
  });

  it("requires a MAC when a hostname is set", () => {
    expect(issuePaths(createAssetSchema.safeParse({ ...base, hostname: "pc1.example.com" }))).toContain("macAddresses");
  });

  it("requires quantity 1 when the row has an identity", () => {
    expect(issuePaths(createAssetSchema.safeParse({ ...base, serialNumber: "SN1", quantity: 3 }))).toEqual(["quantity"]);
    expect(createAssetSchema.safeParse({ ...base, quantity: 3 }).success).toBe(true);
  });

  it("caps MAC and custom field lists", () => {
    const macs = Array.from({ length: MAX_MAC_ADDRESSES + 1 }, () => "AA:BB:CC:DD:EE:FF");
    expect(createAssetSchema.safeParse({ ...base, macAddresses: macs }).success).toBe(false);
    const fields = Array.from({ length: MAX_CUSTOM_FIELDS + 1 }, (_, i) => ({ key: `k${i}`, value: "v" }));
    expect(createAssetSchema.safeParse({ ...base, customFields: fields }).success).toBe(false);
  });

  it("requires type, manufacturer and model", () => {
    expect(issuePaths(createAssetSchema.safeParse({})).sort()).toEqual(["manufacturerId", "modelId", "typeId"]);
  });
});

describe("updateAssetSchema", () => {
  it("accepts a partial update and a locationId move", () => {
    expect(updateAssetSchema.parse({ locationId: "l2" })).toEqual({ locationId: "l2" });
  });

  it("still requires a MAC when a hostname is set", () => {
    expect(issuePaths(updateAssetSchema.safeParse({ hostname: "pc1.example.com" }))).toEqual(["macAddresses"]);
  });

  it("does not enforce the quantity identity rule", () => {
    expect(updateAssetSchema.safeParse({ serialNumber: "SN1", quantity: 3 }).success).toBe(true);
  });
});
