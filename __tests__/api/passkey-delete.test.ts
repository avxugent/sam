import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { passkey: { findUnique: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DELETE } from "@/app/api/auth/passkey/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.passkey.findUnique);
const mockDelete = vi.mocked(prisma.passkey.delete);
const mockLogAudit = vi.mocked(logAudit);

const PARAMS = Promise.resolve({ id: "pk1" });

function req() {
  return new NextRequest("http://localhost/api/auth/passkey/pk1", { method: "DELETE" });
}

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/auth/passkey/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(req(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the passkey does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(req(), { params: PARAMS });
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when the passkey belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValue({ id: "pk1", userId: "someone-else", label: "X" } as never);
    const res = await DELETE(req(), { params: PARAMS });
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes and audits on success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
    mockFindUnique.mockResolvedValue({ id: "pk1", userId: "u1", label: "Laptop" } as never);

    const res = await DELETE(req(), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "pk1" } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "User", detail: { event: "Passkey removed", label: "Laptop" } })
    );
  });
});
