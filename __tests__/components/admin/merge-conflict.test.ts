import { describe, it, expect } from "vitest";
import { readMergeConflict } from "@/components/admin/merge-conflict";

describe("readMergeConflict()", () => {
  it("builds the merge offer from a nameConflict body", () => {
    expect(
      readMergeConflict({ code: "nameConflict", existingId: "m2", existingName: "Dell", existingAssetCount: 4 }, "m1", "Dell")
    ).toEqual({ editingId: "m1", newName: "Dell", existingId: "m2", existingName: "Dell", existingAssetCount: 4, existingStockCount: 0 });
  });

  it("ignores other errors, including a 409 without an existing record", () => {
    expect(readMergeConflict({}, "m1", "Dell")).toBeNull();
    expect(readMergeConflict({ code: "nameConflict" }, "m1", "Dell")).toBeNull();
  });
});
