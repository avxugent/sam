import { describe, it, expect } from "vitest";
import { createLocationSchema, updateLocationSchema, FI_NUMBER_REGEX } from "@/lib/schemas/location";
import { createStockItemSchema, updateStockItemSchema } from "@/lib/schemas/stock";

describe("location schemas", () => {
  it("accepts 2- and 3-digit room segments only", () => {
    expect(FI_NUMBER_REGEX.test("14.10.100.13")).toBe(true);
    expect(FI_NUMBER_REGEX.test("14.10.100.013")).toBe(true);
    expect(FI_NUMBER_REGEX.test("14.10.10.013")).toBe(false);
  });

  it("requires a name on create but not on update", () => {
    expect(createLocationSchema.safeParse({}).success).toBe(false);
    expect(updateLocationSchema.safeParse({ inMaintenance: true }).success).toBe(true);
  });

  it("bounds coordinates on update", () => {
    expect(updateLocationSchema.safeParse({ latitude: 91 }).success).toBe(false);
  });
});

describe("stock item schemas", () => {
  const base = { typeId: "t", modelId: "m" };

  it("defaults quantity to 1 on create and normalizes MACs", () => {
    expect(createStockItemSchema.parse({ ...base, macAddresses: ["aabbccddeeff"] })).toMatchObject({
      quantity: 1,
      macAddresses: ["AA:BB:CC:DD:EE:FF"],
    });
  });

  it("limits a serialized item to quantity 1, on create and update", () => {
    expect(createStockItemSchema.safeParse({ ...base, serialNumber: "SN", quantity: 2 }).success).toBe(false);
    expect(updateStockItemSchema.safeParse({ serialNumber: "SN", quantity: 2 }).success).toBe(false);
    expect(updateStockItemSchema.safeParse({ serialNumber: "SN" }).success).toBe(true);
  });

  it("limits an item with MAC addresses to quantity 1, like an asset", () => {
    expect(createStockItemSchema.safeParse({ ...base, macAddresses: ["aabbccddeeff"], quantity: 2 }).success).toBe(false);
    expect(updateStockItemSchema.safeParse({ macAddresses: ["aabbccddeeff"], quantity: 2 }).success).toBe(false);
    expect(createStockItemSchema.safeParse({ ...base, macAddresses: [], quantity: 2 }).success).toBe(true);
  });
});
