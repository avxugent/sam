import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    location: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/locations/[id]/merge/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "loc1") => Promise.resolve({ id });
function post(body: object) {
  return new NextRequest("http://localhost/api/locations/loc1/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// tx mock: every updateMany reports a count; delete is a no-op.
const tx = {
  asset: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  location: { updateMany: vi.fn().mockResolvedValue({ count: 2 }), delete: vi.fn().mockResolvedValue({}) },
  attachment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  workLog: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.updateMany.mockResolvedValue({ count: 3 });
  tx.location.updateMany.mockResolvedValue({ count: 2 });
  tx.attachment.updateMany.mockResolvedValue({ count: 1 });
  tx.workLog.updateMany.mockResolvedValue({ count: 0 });
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (t: typeof tx) => unknown) => cb(tx)) as never);
});

describe("POST /api/locations/[id]/merge", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "loc2" }), { params: params() })).status).toBe(401);
  });

  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await POST(post({ targetId: "loc2" }), { params: params() })).status).toBe(403);
  });

  it("400 on invalid body (missing targetId)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await POST(post({}), { params: params() })).status).toBe(400);
  });

  it("400 when merging a location into itself", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await POST(post({ targetId: "loc1" }), { params: params() })).status).toBe(400);
  });

  it("404 when source or target is missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "loc2" }), { params: params() })).status).toBe(404);
  });

  it("400 when the two locations have different parents", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockImplementation((({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "loc1"
        ? { id: "loc1", name: "A", parentId: "p1" }
        : { id: "loc2", name: "B", parentId: "p2" })) as never);
    const res = await POST(post({ targetId: "loc2" }), { params: params() });
    expect(res.status).toBe(400);
  });

  it("merges siblings: reassigns children, deletes source, audits, returns counts", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockImplementation((({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "loc1"
        ? { id: "loc1", name: "A", parentId: "p1" }
        : { id: "loc2", name: "B", parentId: "p1" })) as never);

    const res = await POST(post({ targetId: "loc2" }), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "loc2", movedAssets: 3, movedSublocations: 2 });

    expect(tx.asset.updateMany).toHaveBeenCalledWith({ where: { locationId: "loc1" }, data: { locationId: "loc2" } });
    expect(tx.location.updateMany).toHaveBeenCalledWith({ where: { parentId: "loc1" }, data: { parentId: "loc2" } });
    expect(tx.attachment.updateMany).toHaveBeenCalledWith({ where: { locationId: "loc1" }, data: { locationId: "loc2" } });
    expect(tx.workLog.updateMany).toHaveBeenCalledWith({ where: { locationId: "loc1" }, data: { locationId: "loc2" } });
    expect(tx.location.delete).toHaveBeenCalledWith({ where: { id: "loc1" } });

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "Location",
        entityId: "loc1",
        detail: { mergedInto: "B", movedAssets: 3, movedSublocations: 2 },
      })
    );
  });
});
