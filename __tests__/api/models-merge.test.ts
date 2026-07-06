import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/models/merge/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

function post(body: object) {
  return new NextRequest("http://localhost/api/models/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const tx = {
  asset: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.updateMany.mockResolvedValue({ count: 2 });
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (t: typeof tx) => unknown) => cb(tx)) as never);
});

describe("POST /api/models/merge", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(post({ canonical: "PowerEdge R740", variants: ["poweredge r740"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(post({ canonical: "PowerEdge R740", variants: ["poweredge r740"] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(post({ canonical: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when there are no variants to merge", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(post({ canonical: "PowerEdge R740", variants: ["PowerEdge R740"] }));
    expect(res.status).toBe(400);
  });

  it("merges variants onto canonical, audits, and returns the moved count", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(
      post({ canonical: "PowerEdge R740", variants: ["poweredge r740", "PowerEdge  R740"] })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, movedCount: 4 });

    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { model: "poweredge r740" },
      data: { model: "PowerEdge R740" },
    });
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { model: "PowerEdge  R740" },
      data: { model: "PowerEdge R740" },
    });

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "AssetModel",
        entityId: "PowerEdge R740",
        detail: {
          mergedVariants: ["poweredge r740", "PowerEdge  R740"],
          assetsMoved: 4,
        },
      })
    );
  });
});
