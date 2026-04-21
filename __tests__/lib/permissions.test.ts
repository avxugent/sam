import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — cannot reference variables declared in this scope.
// Use vi.fn() directly inside the factory; retrieve the handle via vi.mocked().
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { canEdit, isAdmin, requireAuth, requireRole } from "@/lib/permissions";

const mockAuth = vi.mocked(auth);

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

describe("requireAuth()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session when authenticated", async () => {
    const session = { user: { id: "u1", role: "VIEWER" } };
    mockAuth.mockResolvedValue(session as never);
    await expect(requireAuth()).resolves.toEqual(session);
  });

  it("throws Unauthorized when session is null", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });

  it("throws Unauthorized when session has no user", async () => {
    mockAuth.mockResolvedValue({} as never);
    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });
});

describe("requireRole()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session when the user has an allowed role", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    mockAuth.mockResolvedValue(session as never);
    await expect(requireRole("ADMIN", "EDITOR")).resolves.toEqual(session);
  });

  it("throws Forbidden when the user role is not in the allowed list", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    await expect(requireRole("ADMIN", "EDITOR")).rejects.toThrow("Forbidden");
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
