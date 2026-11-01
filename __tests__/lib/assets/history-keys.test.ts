import { describe, it, expect } from "vitest";
import { HISTORY_CHANGE_LABELS, HISTORY_SNAPSHOT_KEYS } from "@/lib/assets/history-keys";

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
