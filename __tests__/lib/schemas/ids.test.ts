import { describe, it, expect } from "vitest";
import { idSchema, MAX_ID_LENGTH } from "@/lib/schemas/ids";
import { createAssetSchema } from "@/lib/schemas/asset";

describe("idSchema", () => {
  it("accepts a cuid-sized id", () => {
    expect(idSchema.safeParse("clx0k3v9a0000qz8h2b3c4d5e").success).toBe(true);
  });

  it("rejects an empty or over-long id", () => {
    expect(idSchema.safeParse("").success).toBe(false);
    expect(idSchema.safeParse("x".repeat(MAX_ID_LENGTH + 1)).success).toBe(false);
  });
});

describe("id fields in the shared schemas", () => {
  it("cap body ids at MAX_ID_LENGTH", () => {
    const long = "x".repeat(MAX_ID_LENGTH + 1);
    const result = createAssetSchema.safeParse({ typeId: long, manufacturerId: "m1", modelId: "mo1" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "typeId")).toBe(true);
  });
});
