import { describe, it, expect } from "vitest";
import { createAssetSchema, updateAssetSchema, hasDeviceIdentity, MAX_CUSTOM_FIELDS } from "@/lib/schemas/asset";
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

  it("stores the hostname trimmed, and a blank one as no hostname", () => {
    const mac = { macAddresses: ["AA:BB:CC:DD:EE:FF"] };
    expect(createAssetSchema.parse({ ...base, ...mac, hostname: "  pc1.example.com " }).hostname).toBe("pc1.example.com");
    expect(createAssetSchema.parse({ ...base, hostname: "   " }).hostname).toBeNull();
    expect(updateAssetSchema.parse({ hostname: "" }).hostname).toBeNull();
    expect(updateAssetSchema.parse({}).hostname).toBeUndefined();
  });

  it("does not ask for a MAC for a blank hostname", () => {
    expect(createAssetSchema.safeParse({ ...base, hostname: "  " }).success).toBe(true);
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

  it("leaves the hostname-requires-MAC rule to the route, which sees the stored MACs", () => {
    expect(updateAssetSchema.safeParse({ hostname: "pc1.example.com" }).success).toBe(true);
  });

  it("does not enforce the quantity identity rule", () => {
    expect(updateAssetSchema.safeParse({ serialNumber: "SN1", quantity: 3 }).success).toBe(true);
  });
});

describe("hasDeviceIdentity", () => {
  it("is true for a serial, hostname or MAC, ignoring blank values", () => {
    expect(hasDeviceIdentity({ serialNumber: "SN1", macCount: 0 })).toBe(true);
    expect(hasDeviceIdentity({ hostname: "pc1", macCount: 0 })).toBe(true);
    expect(hasDeviceIdentity({ macCount: 1 })).toBe(true);
    expect(hasDeviceIdentity({ serialNumber: " ", hostname: null, macCount: 0 })).toBe(false);
  });
});
