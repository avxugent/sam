import { describe, it, expect } from "vitest";
import { HISTORY_CHANGE_LABELS, HISTORY_SNAPSHOT_KEYS, assetSnapshot } from "@/lib/assets/history-keys";

// Existing audit rows carry these strings, so they may never change.
describe("history keys", () => {
  it("keeps the snapshot keys stored in existing audit rows", () => {
    expect(HISTORY_SNAPSHOT_KEYS).toEqual({
      deployedFromStock: "Deployed from stock",
      returnedToStock: "Returned to stock",
      returnedFromAssetAt: "Returned from asset at",
      deployedQuantity: "Deployed quantity",
    });
  });

  it("keeps the change labels stored in existing audit rows", () => {
    expect(HISTORY_CHANGE_LABELS).toEqual({ location: "Location" });
  });
});

describe("assetSnapshot()", () => {
  it("lists what identifies the asset and leaves empty values out", () => {
    expect(
      assetSnapshot({ type: { name: "PC" }, manufacturer: null, model: { name: "XPS" }, serialNumber: "", hostname: "pc-01", location: { name: "R1" }, quantity: 1 })
    ).toEqual({ Type: "PC", Model: "XPS", Hostname: "pc-01", Location: "R1" });
  });

  it("records a quantity other than 1", () => {
    expect(assetSnapshot({ model: { name: "Cable" }, quantity: 5 })).toEqual({ Model: "Cable", Quantity: 5 });
  });
});
