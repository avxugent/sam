import { describe, it, expect } from "vitest";
import { auditChanges } from "@/lib/audit-diff";

describe("auditChanges()", () => {
  it("records only fields whose compared values differ", () => {
    expect(
      auditChanges([
        { label: "Name", before: "Old", after: "New" },
        { label: "Notes", before: "same", after: "same" },
      ])
    ).toEqual({ Name: { from: "Old", to: "New" } });
  });

  it("skips fields the request did not touch", () => {
    expect(auditChanges([false, { label: "Qty", before: 1, after: 2 }])).toEqual({ Qty: { from: 1, to: 2 } });
  });

  it("compares by id but records the display values, normalising undefined to null", () => {
    expect(
      auditChanges([{ label: "Model", before: "m1", after: "m2", display: [undefined, "XPS 13"] }])
    ).toEqual({ Model: { from: null, to: "XPS 13" } });
  });
});
