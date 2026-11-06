import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST as createAssetType } from "@/app/api/asset-types/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("audit — asset type create", () => {
  it("logs CREATE on AssetType", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.create).mockResolvedValue({ id: "at1", name: "Monitor" } as never);

    const res = await createAssetType(req("http://localhost/api/asset-types", { name: "Monitor" }));
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "AssetType", entityId: "at1", entityName: "Monitor" })
    );
  });

  it("does not log when name conflicts", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await createAssetType(req("http://localhost/api/asset-types", { name: "Monitor" }));
    expect(res.status).toBe(409);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
