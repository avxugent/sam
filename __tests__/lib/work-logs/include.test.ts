import { describe, it, expect } from "vitest";
import { WORK_LOG_INCLUDE } from "@/lib/work-logs/include";

describe("WORK_LOG_INCLUDE", () => {
  it("includes exactly the performer, item and asset relations", () => {
    expect(Object.keys(WORK_LOG_INCLUDE).sort()).toEqual(["asset", "item", "performedBy"]);
  });

  it("selects only id, name and email of the performer (never secrets)", () => {
    expect(WORK_LOG_INCLUDE.performedBy).toEqual({ select: { id: true, name: true, email: true } });
    const fields = Object.keys(WORK_LOG_INCLUDE.performedBy.select);
    for (const secret of ["passwordHash", "totpSecret"]) expect(fields).not.toContain(secret);
  });

  it("selects the item's id and name", () => {
    expect(WORK_LOG_INCLUDE.item).toEqual({ select: { id: true, name: true } });
  });

  it("selects the asset fields used to label it", () => {
    expect(WORK_LOG_INCLUDE.asset).toEqual({
      select: {
        id: true,
        model: { select: { name: true } },
        serialNumber: true,
        hostname: true,
        type: { select: { id: true, name: true } },
      },
    });
  });
});
