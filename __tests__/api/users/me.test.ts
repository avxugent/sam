import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2b$13$hashed"),
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { PATCH } from "@/app/api/users/me/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);
const mockCompare = vi.mocked(bcrypt.compare);

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/users/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await PATCH(makeRequest({ name: "New Name" }));
    expect(res.status).toBe(401);
  });

  it("updates name for any authenticated user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);
    mockUpdate.mockResolvedValue({ id: "u1", name: "New Name" } as never);

    const res = await PATCH(makeRequest({ name: "New Name" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "New Name" }) })
    );
  });

  it("returns 400 when no changes provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);

    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when current password is wrong", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);
    mockCompare.mockResolvedValue(false as never);

    const res = await PATCH(makeRequest({
      currentPassword: "wrongpassword",
      newPassword: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/incorrect/i);
  });

  it("updates password when current password is correct", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);
    mockCompare.mockResolvedValue(true as never);
    mockUpdate.mockResolvedValue({ id: "u1", name: "User" } as never);

    const res = await PATCH(makeRequest({
      currentPassword: "oldpassword",
      newPassword: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: "$2b$13$hashed" }),
      })
    );
  });

  it("returns 400 when passwords do not match", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);

    const res = await PATCH(makeRequest({
      currentPassword: "oldpassword",
      newPassword: "newpassword1",
      confirmPassword: "different",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when SSO user tries to change password", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: null, provider: "microsoft-entra-id" } as never);

    const res = await PATCH(makeRequest({
      currentPassword: "anything",
      newPassword: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/SSO/i);
  });

  it("returns 400 for new password shorter than 8 chars", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    mockFindUnique.mockResolvedValue({ passwordHash: "$2b$hash", provider: "credentials" } as never);

    const res = await PATCH(makeRequest({
      currentPassword: "oldpassword",
      newPassword: "short",
      confirmPassword: "short",
    }));
    expect(res.status).toBe(400);
  });
});
