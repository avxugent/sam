import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed") } }));

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET, POST } from "@/app/api/users/route";
import { PUT, DELETE } from "@/app/api/users/[id]/route";

const mockAuth = vi.mocked(auth);
const user = vi.mocked(prisma.user);

function session(role: string, id = "me") {
  return { user: { id, email: "me@x.com", role } } as never;
}
function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/users", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = (id = "u2") => ({ params: Promise.resolve({ id }) });
const validCreate = { name: "Pat", email: "pat@x.com", password: "longenough", role: "EDITOR" };

beforeEach(() => vi.clearAllMocks());

describe("auth guards", () => {
  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(req("POST", validCreate))],
    ["PUT", () => PUT(req("PUT", { name: "x" }), params())],
    ["DELETE", () => DELETE(req("DELETE"), params())],
  ])("%s: 401 unauthenticated, 403 for non-admin", async (_m, call) => {
    mockAuth.mockResolvedValue(null as never);
    expect((await call()).status).toBe(401);
    mockAuth.mockResolvedValue(session("MAINTAINER"));
    expect((await call()).status).toBe(403);
  });
});

describe("GET /api/users", () => {
  it("lists users for admins", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    user.findMany.mockResolvedValue([{ id: "u1" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "u1" }]);
  });
});

describe("POST /api/users", () => {
  beforeEach(() => mockAuth.mockResolvedValue(session("ADMIN")));

  it("400 on invalid input", async () => {
    const res = await POST(req("POST", { ...validCreate, password: "short" }));
    expect(res.status).toBe(400);
    expect((await res.json()).details.fieldErrors.password).toBeDefined();
  });

  it("400 on an unknown role", async () => {
    expect((await POST(req("POST", { ...validCreate, role: "ROOT" }))).status).toBe(400);
  });

  it("409 when the email is taken (unique constraint, also under a concurrent create)", async () => {
    user.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await POST(req("POST", validCreate))).status).toBe(409);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("rethrows other database errors", async () => {
    user.create.mockRejectedValueOnce(new Error("db down"));
    await expect(POST(req("POST", validCreate))).rejects.toThrow("db down");
  });

  it("creates a credentials user with a bcrypt cost-13 hash", async () => {
    user.create.mockResolvedValue({ id: "u9", name: "Pat", email: "pat@x.com", role: "EDITOR" } as never);
    const res = await POST(req("POST", validCreate));
    expect(res.status).toBe(201);
    expect(bcrypt.hash).toHaveBeenCalledWith("longenough", 13);
    expect(user.create.mock.calls[0][0].data).toMatchObject({ provider: "credentials", passwordHash: "hashed", mustChangePassword: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityId: "u9" }));
  });
});

describe("PUT /api/users/[id]", () => {
  beforeEach(() => mockAuth.mockResolvedValue(session("ADMIN")));
  const target = { provider: "credentials", name: "Pat", email: "pat@x.com", role: "EDITOR", twoFactorRequired: false };

  it("404 for an unknown user", async () => {
    user.findUnique.mockResolvedValue(null as never);
    expect((await PUT(req("PUT", { name: "x" }), params())).status).toBe(404);
  });

  it("rejects a password for SSO users", async () => {
    user.findUnique.mockResolvedValue({ ...target, provider: "microsoft-entra-id" } as never);
    const res = await PUT(req("PUT", { password: "longenough" }), params());
    expect(res.status).toBe(400);
    expect(user.update).not.toHaveBeenCalled();
  });

  it("a password reset forces a change on next login", async () => {
    user.findUnique.mockResolvedValue(target as never);
    user.update.mockResolvedValue({ id: "u2", email: "pat@x.com" } as never);
    expect((await PUT(req("PUT", { password: "longenough" }), params())).status).toBe(200);
    expect(user.update.mock.calls[0][0].data).toMatchObject({ passwordHash: "hashed", mustChangePassword: true });
  });

  it("refuses to demote the last admin", async () => {
    user.findUnique.mockResolvedValue({ ...target, role: "ADMIN" } as never);
    user.count.mockResolvedValue(1 as never);
    expect((await PUT(req("PUT", { role: "VIEWER" }), params())).status).toBe(400);
    expect(user.update).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when another admin remains", async () => {
    user.findUnique.mockResolvedValue({ ...target, role: "ADMIN" } as never);
    user.count.mockResolvedValue(2 as never);
    user.update.mockResolvedValue({ id: "u2", email: "pat@x.com" } as never);
    expect((await PUT(req("PUT", { role: "VIEWER" }), params())).status).toBe(200);
  });

  it("409 when the new email collides", async () => {
    user.findUnique.mockResolvedValue(target as never);
    user.update.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await PUT(req("PUT", { email: "taken@x.com" }), params())).status).toBe(409);
  });

  it("audits only the fields that changed", async () => {
    user.findUnique.mockResolvedValue(target as never);
    user.update.mockResolvedValue({ id: "u2", email: "pat@x.com" } as never);
    await PUT(req("PUT", { name: "Pat", role: "MAINTAINER" }), params());
    expect(vi.mocked(logAudit).mock.calls[0][0].detail).toEqual({ changes: { Role: { from: "EDITOR", to: "MAINTAINER" } } });
  });
});

describe("DELETE /api/users/[id]", () => {
  beforeEach(() => mockAuth.mockResolvedValue(session("ADMIN")));

  it("refuses self-deletion", async () => {
    expect((await DELETE(req("DELETE"), params("me"))).status).toBe(400);
  });

  it("404 for an unknown user", async () => {
    user.findUnique.mockResolvedValue(null as never);
    expect((await DELETE(req("DELETE"), params())).status).toBe(404);
  });

  it("refuses to delete the last admin", async () => {
    user.findUnique.mockResolvedValue({ role: "ADMIN", email: "a@x.com" } as never);
    user.count.mockResolvedValue(1 as never);
    expect((await DELETE(req("DELETE"), params())).status).toBe(400);
    expect(user.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits", async () => {
    user.findUnique.mockResolvedValue({ role: "VIEWER", email: "v@x.com" } as never);
    user.count.mockResolvedValue(1 as never);
    const res = await DELETE(req("DELETE"), params());
    expect(res.status).toBe(200);
    expect(user.delete).toHaveBeenCalledWith({ where: { id: "u2" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityName: "v@x.com" }));
  });
});
