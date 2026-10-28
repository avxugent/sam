import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { attachment: { findMany: vi.fn() }, asset: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as locationAttachments } from "@/app/api/locations/[id]/attachments/route";
import { GET as manufacturerAssets } from "@/app/api/manufacturers/[id]/assets/route";

const mockAuth = vi.mocked(auth);
const params = { params: Promise.resolve({ id: "x1" }) };
const req = () => new NextRequest("http://localhost/api/x");

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
});

describe("GET /api/locations/[id]/attachments", () => {
  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await locationAttachments(req(), params)).status).toBe(401);
  });

  it("lists the location's attachments, newest first", async () => {
    vi.mocked(prisma.attachment.findMany).mockResolvedValue([{ id: "a1" }] as never);
    const res = await locationAttachments(req(), params);
    expect(await res.json()).toEqual([{ id: "a1" }]);
    expect(prisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locationId: "x1" }, orderBy: { createdAt: "desc" } })
    );
  });
});

describe("GET /api/manufacturers/[id]/assets", () => {
  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await manufacturerAssets(req(), params)).status).toBe(401);
  });

  it("lists the manufacturer's installed assets only", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([{ id: "as1" }] as never);
    const res = await manufacturerAssets(req(), params);
    expect(await res.json()).toEqual([{ id: "as1" }]);
    expect(vi.mocked(prisma.asset.findMany).mock.calls[0][0]?.where).toEqual({ manufacturerId: "x1", status: "INSTALLED" });
  });
});
