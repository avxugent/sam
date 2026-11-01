import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => {
  const user = { count: vi.fn(), create: vi.fn() };
  // The interactive transaction runs its callback against the same mocked client.
  return { prisma: { user, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user })) } };
});

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("$2b$12$hashed") },
}));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/setup/route";

const mockCount = vi.mocked(prisma.user.count);
const mockCreate = vi.mocked(prisma.user.create);

beforeEach(() => vi.clearAllMocks());

// ── GET /api/setup ────────────────────────────────────────────────────────────

describe("GET /api/setup", () => {
  it("returns setupRequired=true when no users exist", async () => {
    mockCount.mockResolvedValue(0);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.setupRequired).toBe(true);
  });

  it("returns setupRequired=false when users already exist", async () => {
    mockCount.mockResolvedValue(3);
    const res = await GET();
    const body = await res.json();
    expect(body.setupRequired).toBe(false);
  });
});

// ── POST /api/setup ───────────────────────────────────────────────────────────

describe("POST /api/setup", () => {
  function makeRequest(body: object) {
    return new NextRequest("http://localhost/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates the first admin user and returns ok", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ id: "1", name: "Admin", email: "admin@test.com" } as never);

    const res = await POST(makeRequest({
      name: "Admin",
      email: "admin@test.com",
      password: "securepassword",
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "admin@test.com",
          role: "ADMIN",
        }),
      })
    );
  });

  it("returns 403 when users already exist (setup already done)", async () => {
    mockCount.mockResolvedValue(1);
    const res = await POST(makeRequest({
      name: "Admin",
      email: "admin@test.com",
      password: "securepassword",
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid email", async () => {
    mockCount.mockResolvedValue(0);
    const res = await POST(makeRequest({
      name: "Admin",
      email: "not-an-email",
      password: "securepassword",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for password shorter than 8 characters", async () => {
    mockCount.mockResolvedValue(0);
    const res = await POST(makeRequest({
      name: "Admin",
      email: "admin@test.com",
      password: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    mockCount.mockResolvedValue(0);
    const res = await POST(makeRequest({
      email: "admin@test.com",
      password: "securepassword",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a name over the length cap", async () => {
    mockCount.mockResolvedValue(0);
    const res = await POST(makeRequest({ name: "x".repeat(129), email: "admin@test.com", password: "securepassword" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when a concurrent setup created the admin first", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await POST(makeRequest({ name: "Admin", email: "admin@test.com", password: "securepassword" }));
    expect(res.status).toBe(403);
  });

  it("re-checks the user count inside a Serializable transaction", async () => {
    // Two different-email requests can both pass the first count; the second one is in the transaction.
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const res = await POST(makeRequest({ name: "Admin", email: "other@test.com", password: "securepassword" }));
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("returns 403 when a concurrent setup won the transaction (deadlock rollback)", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("deadlock"), { code: "P2034" }));
    const res = await POST(makeRequest({ name: "Admin", email: "other@test.com", password: "securepassword" }));
    expect(res.status).toBe(403);
  });

  it("rethrows unexpected database errors", async () => {
    mockCount.mockResolvedValue(0);
    mockCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(POST(makeRequest({ name: "Admin", email: "admin@test.com", password: "securepassword" }))).rejects.toThrow("db down");
  });
});
