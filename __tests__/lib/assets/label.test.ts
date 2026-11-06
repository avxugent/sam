import { describe, it, expect } from "vitest";
import { assetLabel } from "@/lib/assets/label";

describe("assetLabel", () => {
  it("prefers the model name", () => {
    expect(assetLabel({ model: { name: "X1" }, hostname: "pc-1", serialNumber: "SN" })).toBe("X1");
  });

  it("falls back to the hostname, then the serial number", () => {
    expect(assetLabel({ model: null, hostname: "pc-1", serialNumber: "SN" })).toBe("pc-1");
    expect(assetLabel({ model: null, hostname: null, serialNumber: "SN" })).toBe("SN");
  });

  it("skips empty strings", () => {
    expect(assetLabel({ model: { name: "" }, hostname: "", serialNumber: "SN" })).toBe("SN");
  });

  it("is null when the asset has none of them", () => {
    expect(assetLabel({ model: null, hostname: null, serialNumber: "" })).toBeNull();
    expect(assetLabel({})).toBeNull();
  });
});
