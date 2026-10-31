import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stockItem: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/stock/bulk-relocate/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.stockItem.findMany);
const mockUpdateMany = vi.mocked(prisma.stockItem.updateMany);
const mockLocationFindUnique = vi.mocked(prisma.location.findUnique);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "Test", email: "t@test.com" } };
}

function req(body?: object) {
  return new NextRequest("http://localhost/api/stock/bulk-relocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 0 } as never);
});

describe("POST /api/stock/bulk-relocate", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ ids: ["a"], locationId: null }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(req({ ids: ["a"], locationId: null }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty ids array", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(req({ ids: [], locationId: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids exceeds the 200-item cap", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(req({ ids: Array.from({ length: 201 }, (_, i) => `id-${i}`), locationId: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the destination location does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue(null);
    const res = await POST(req({ ids: ["a"], locationId: "loc-missing" }));
    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("relocates found items and reports missing ones as failed", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ name: "Store B" } as never);
    mockFindMany.mockResolvedValue([
      { id: "item-1", lineageId: "lin-1", model: { name: "Dell U2722D" }, locationId: "loc-old", location: { name: "Store A" } },
      { id: "item-2", lineageId: "lin-2", model: { name: "HP Monitor" }, locationId: null, location: null },
    ] as never);

    const res = await POST(req({ ids: ["item-1", "item-2", "item-missing"], locationId: "loc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded).toEqual(["item-1", "item-2"]);
    expect(body.failed).toEqual([{ id: "item-missing", reason: "NOT_FOUND" }]);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1", "item-2"] } },
      data: { locationId: "loc-1" },
    });
    expect(mockLogAudit).toHaveBeenCalledTimes(2);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "StockItem",
        entityId: "item-1",
        entityName: "Dell U2722D",
        detail: { changes: { Location: { from: "Store A", to: "Store B" } } },
        lineageId: "lin-1",
      })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "item-2", detail: { changes: { Location: { from: null, to: "Store B" } } }, lineageId: "lin-2" })
    );
  });

  it("supports unassigning (locationId: null) without validating a location", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindMany.mockResolvedValue([{ id: "item-1", model: "Dell U2722D", locationId: "loc-old" }] as never);

    const res = await POST(req({ ids: ["item-1"], locationId: null }));
    expect(res.status).toBe(200);
    expect(mockLocationFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] } },
      data: { locationId: null },
    });
  });
});
