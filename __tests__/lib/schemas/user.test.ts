import { describe, it, expect } from "vitest";
import { createUserSchema, editUserFormSchema, updateUserSchema } from "@/lib/schemas/user";

const base = { name: "Jane", email: "jane@example.com", role: "EDITOR" };

describe("user schemas", () => {
  it("create requires an 8+ character password and defaults the enrollment flags", () => {
    expect(createUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(createUserSchema.parse({ ...base, password: "long-enough" })).toMatchObject({
      mustChangePassword: true,
      twoFactorRequired: false,
    });
  });

  it("update accepts any subset of fields but still enforces the password rule", () => {
    expect(updateUserSchema.safeParse({ role: "VIEWER" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });

  it("edit form treats an empty password as unchanged and rejects short ones like the API", () => {
    expect(editUserFormSchema.safeParse({ ...base, password: "" }).success).toBe(true);
    expect(editUserFormSchema.safeParse({ ...base }).success).toBe(true);
    expect(editUserFormSchema.safeParse({ ...base, password: "abc" }).success).toBe(false);
  });
});
