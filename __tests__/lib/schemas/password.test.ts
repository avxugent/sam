import { describe, it, expect } from "vitest";
import { buildPasswordChangeSchema, passwordChangeSchema } from "@/lib/schemas/password";

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

describe("buildPasswordChangeSchema", () => {
  it("reports the messages it was built with", () => {
    const schema = buildPasswordChangeSchema({ currentRequired: "c", tooShort: "s", confirmRequired: "r", mismatch: "m" });
    const r = schema.safeParse({ currentPassword: "", newPassword: "short", confirmPassword: "other" });
    expect(r.success).toBe(false);
    const messages = r.error!.issues.map((i) => i.message).sort();
    expect(messages).toEqual(["c", "m", "s"]);
  });
});
