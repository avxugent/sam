import { describe, it, expect, vi } from "vitest";

// permissions.ts imports auth which pulls in next-auth / next/server.
// Mock those at the module level so the test worker can load the module.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { canEdit, isAdmin } from "@/lib/permissions";

describe("canEdit()", () => {
  it("returns true for ADMIN", () => {
    expect(canEdit("ADMIN")).toBe(true);
  });

  it("returns true for EDITOR", () => {
    expect(canEdit("EDITOR")).toBe(true);
  });

  it("returns false for VIEWER", () => {
    expect(canEdit("VIEWER")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(canEdit("")).toBe(false);
  });
});

describe("isAdmin()", () => {
  it("returns true for ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
  });

  it("returns false for EDITOR", () => {
    expect(isAdmin("EDITOR")).toBe(false);
  });

  it("returns false for VIEWER", () => {
    expect(isAdmin("VIEWER")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAdmin("")).toBe(false);
  });
});
