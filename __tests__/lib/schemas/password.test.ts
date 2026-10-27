import { describe, it, expect } from "vitest";
import { passwordChangeSchema } from "@/lib/schemas/password";

describe("passwordChangeSchema", () => {
  const valid = { currentPassword: "old", newPassword: "longenough", confirmPassword: "longenough" };

  it("accepts a matching new password of at least 8 characters", () => {
    expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
  });

  it("flags a mismatch on confirmPassword", () => {
    const r = passwordChangeSchema.safeParse({ ...valid, confirmPassword: "different" });
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual(["confirmPassword"]);
  });

  it("rejects short passwords and missing fields", () => {
    expect(passwordChangeSchema.safeParse({ ...valid, newPassword: "short", confirmPassword: "short" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });
});
