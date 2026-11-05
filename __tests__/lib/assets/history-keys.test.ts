import { describe, it, expect } from "vitest";
import { HISTORY_CHANGE_LABELS, HISTORY_SNAPSHOT_KEYS, assetSnapshot, sortedMacs } from "@/lib/assets/history-keys";

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
    expect(HISTORY_CHANGE_LABELS).toEqual({
      location: "Location",
      type: "Type",
      manufacturer: "Manufacturer",
      model: "Model",
      serialNumber: "Serial number",
      quantity: "Quantity",
      notes: "Notes",
      invoiceNumber: "Invoice number",
      invoiceDate: "Invoice date",
      macAddresses: "MAC addresses",
    });
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

describe("sortedMacs()", () => {
  it("sorts and joins the addresses", () => {
    expect(sortedMacs(["bb:bb", "aa:aa"])).toBe("aa:aa, bb:bb");
  });

  it("is null for an empty list, and leaves its input unsorted", () => {
    const input = ["b", "a"];
    sortedMacs(input);
    expect(input).toEqual(["b", "a"]);
    expect(sortedMacs([])).toBeNull();
  });
});
