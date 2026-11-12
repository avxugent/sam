import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET, POST } from "@/app/api/users/me/api-keys/route";
import { DELETE } from "@/app/api/users/me/api-keys/[id]/route";

const mockAuth = vi.mocked(auth);
const signedIn = { user: { id: "u1", role: "VIEWER", name: "T", email: "t@test.com" } };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/users/me/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/users/me/api-keys/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(signedIn as never);
  vi.mocked(prisma.apiKey.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.apiKey.create).mockImplementation((async ({ data }: { data: { label: string; keyPrefix: string; expiresAt: Date | null } }) => ({
    id: "k1",
    label: data.label,
    keyPrefix: data.keyPrefix,
    createdAt: new Date(),
    lastUsedAt: null,
    expiresAt: data.expiresAt,
  })) as never);
});

describe("GET /api/users/me/api-keys", () => {
  it("401 when not signed in", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  it("lists only the caller's keys, selecting no hash", async () => {
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([] as never);
    expect((await GET()).status).toBe(200);
    const arg = vi.mocked(prisma.apiKey.findMany).mock.calls[0][0]!;
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.select).not.toHaveProperty("keyHash");
  });
});

describe("POST /api/users/me/api-keys", () => {
  it("401 when not signed in", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(post({ label: "x" }))).status).toBe(401);
  });

  it.each([{}, { label: "  " }, { label: "x".repeat(101) }, { label: "x", expiresInDays: 0 }, { label: "x", expiresInDays: 366 }])(
    "400 for invalid body %j",
    async (body) => {
      expect((await POST(post(body))).status).toBe(400);
      expect(prisma.apiKey.create).not.toHaveBeenCalled();
    }
  );

  it("409 at the per-user key limit", async () => {
    vi.mocked(prisma.apiKey.count).mockResolvedValue(20 as never);
    const res = await POST(post({ label: "x" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("tooManyApiKeys");
  });

  it("201 returns the plaintext key once, stores only its hash, and audits without it", async () => {
    const res = await POST(post({ label: "Claude", expiresInDays: 30 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toMatch(/^sam_mcp_/);
    expect(body).not.toHaveProperty("keyHash");

    const data = vi.mocked(prisma.apiKey.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.userId).toBe("u1");
    expect(data.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain(body.key);
    expect(data.expiresAt).toBeInstanceOf(Date);

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "ApiKey" }));
    expect(JSON.stringify(vi.mocked(logAudit).mock.calls)).not.toContain(body.key);
  });

  it("creates a key that never expires when no lifetime is given", async () => {
    await POST(post({ label: "Claude" }));
    expect(vi.mocked(prisma.apiKey.create).mock.calls[0][0].data).toMatchObject({ expiresAt: null });
  });
});

describe("DELETE /api/users/me/api-keys/[id]", () => {
  it("401 when not signed in", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await del("k1")).status).toBe(401);
  });

  it("404 for a missing key and for another user's key", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null as never);
    expect((await del("k1")).status).toBe(404);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({ userId: "someone-else", label: "x", keyPrefix: "sam_mcp_abcd" } as never);
    expect((await del("k1")).status).toBe(404);
    expect(prisma.apiKey.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes an own key and audits it", async () => {
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({ userId: "u1", label: "Claude", keyPrefix: "sam_mcp_abcd" } as never);
    const res = await del("k1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({ where: { id: "k1", userId: "u1" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "ApiKey", entityId: "k1" }));
  });
});
