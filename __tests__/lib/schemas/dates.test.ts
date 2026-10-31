import { describe, it, expect } from "vitest";
import { isoDay, optionalIsoDay } from "@/lib/schemas/dates";
import { createAssetSchema } from "@/lib/schemas/asset";

describe("isoDay / optionalIsoDay", () => {
  it("accepts a real YYYY-MM-DD day only", () => {
    expect(isoDay.safeParse("2026-03-05").success).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "05/03/2026", "2026-03-05T10:00:00Z", "soon"]) {
      expect(isoDay.safeParse(bad).success).toBe(false);
    }
  });

  it("lets a form clear the field with \"\" or null", () => {
    for (const v of ["", null, undefined, "2026-03-05"]) expect(optionalIsoDay.safeParse(v).success).toBe(true);
  });

  it("rejects an invalid asset date at the API boundary instead of in Prisma", () => {
    const base = { typeId: "t", manufacturerId: "m", modelId: "mo" };
    expect(createAssetSchema.safeParse({ ...base, installationDate: "not a date" }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...base, installationDate: "2026-03-05", invoiceDate: "" }).success).toBe(true);
  });
});
