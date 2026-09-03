import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    assetType: { findUnique: vi.fn() },
    manufacturer: { findUnique: vi.fn() },
    assetTypeModelTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { GET as listOverrides, POST as createOverride } from "@/app/api/asset-types/[id]/model-templates/route";
import { PUT as updateOverride, DELETE as deleteOverride } from "@/app/api/asset-types/model-templates/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id: string) => Promise.resolve({ id });
function jreq(url: string, body?: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/asset-types/[id]/model-templates", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await listOverrides(new Request("http://x"), { params: params("t1") });
    expect(res.status).toBe(401);
  });

  it("returns overrides mapped with manufacturer name and model", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.assetTypeModelTemplate.findMany).mockResolvedValue([
      { id: "o1", manufacturerId: "m1", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://x", manufacturer: { name: "Epson" } },
    ] as never);
    const res = await listOverrides(new Request("http://x"), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "o1", manufacturerId: "m1", manufacturerName: "Epson", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://x" },
    ]);
  });
});

describe("POST /api/asset-types/[id]/model-templates", () => {
  const body = { manufacturerId: "m1", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://x" };

  it("401 / 403 guard", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await createOverride(jreq("http://x", body), { params: params("t1") })).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await createOverride(jreq("http://x", body), { params: params("t1") })).status).toBe(403);
  });

  it("404 when asset type missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null as never);
    const res = await createOverride(jreq("http://x", body), { params: params("t1") });
    expect(res.status).toBe(404);
  });

  it("400 on invalid body", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    const res = await createOverride(jreq("http://x", { manufacturerId: "m1", model: "" }), { params: params("t1") });
    expect(res.status).toBe(400);
  });

  it("400 on invalid template syntax", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    const res = await createOverride(
      jreq("http://x", { manufacturerId: "m1", model: "Pearl-2", scrapeTargetTemplate: "no-equals-sign" }),
      { params: params("t1") }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Template syntax error");
  });

  it("404 when manufacturer missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValue(null as never);
    const res = await createOverride(jreq("http://x", body), { params: params("t1") });
    expect(res.status).toBe(404);
  });

  it("409 on duplicate override", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValue({ id: "m1", name: "Epson" } as never);
    vi.mocked(prisma.assetTypeModelTemplate.create).mockRejectedValue({ code: "P2002" });
    const res = await createOverride(jreq("http://x", body), { params: params("t1") });
    expect(res.status).toBe(409);
  });

  it("201 creates and audits CREATE", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValue({ id: "m1", name: "Epson" } as never);
    vi.mocked(prisma.assetTypeModelTemplate.create).mockResolvedValue({
      id: "o1", manufacturerId: "m1", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://x",
    } as never);
    const res = await createOverride(jreq("http://x", body), { params: params("t1") });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: "o1", manufacturerId: "m1", manufacturerName: "Epson", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://x",
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "AssetTypeModelTemplate", entityId: "o1" })
    );
  });
});

describe("PUT /api/asset-types/model-templates/[id]", () => {
  it("401 / 403 guard", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await updateOverride(jreq("http://x", { scrapeTargetTemplate: "a=b" }, "PUT"), { params: params("o1") })).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await updateOverride(jreq("http://x", { scrapeTargetTemplate: "a=b" }, "PUT"), { params: params("o1") })).status).toBe(403);
  });

  it("404 when override missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue(null as never);
    const res = await updateOverride(jreq("http://x", { scrapeTargetTemplate: "a=b" }, "PUT"), { params: params("o1") });
    expect(res.status).toBe(404);
  });

  it("400 on invalid template syntax", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue({
      id: "o1", model: "Pearl-2", type: { name: "T" }, manufacturer: { name: "Epson" },
    } as never);
    const res = await updateOverride(jreq("http://x", { scrapeTargetTemplate: "no-equals" }, "PUT"), { params: params("o1") });
    expect(res.status).toBe(400);
  });

  it("200 updates and audits UPDATE", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue({
      id: "o1", model: "Pearl-2", type: { name: "T" }, manufacturer: { name: "Epson" },
    } as never);
    vi.mocked(prisma.assetTypeModelTemplate.update).mockResolvedValue({
      id: "o1", manufacturerId: "m1", model: "Pearl-2", scrapeTargetTemplate: "__address__=https://y",
    } as never);
    const res = await updateOverride(
      jreq("http://x", { scrapeTargetTemplate: "__address__=https://y" }, "PUT"),
      { params: params("o1") }
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "AssetTypeModelTemplate", entityId: "o1" })
    );
  });
});

describe("DELETE /api/asset-types/model-templates/[id]", () => {
  it("401 / 403 guard", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await deleteOverride(jreq("http://x", undefined, "DELETE"), { params: params("o1") })).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await deleteOverride(jreq("http://x", undefined, "DELETE"), { params: params("o1") })).status).toBe(403);
  });

  it("404 when override missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue(null as never);
    const res = await deleteOverride(jreq("http://x", undefined, "DELETE"), { params: params("o1") });
    expect(res.status).toBe(404);
  });

  it("204 deletes and audits DELETE", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue({
      id: "o1", model: "Pearl-2", type: { name: "T" }, manufacturer: { name: "Epson" },
    } as never);
    vi.mocked(prisma.assetTypeModelTemplate.delete).mockResolvedValue({ id: "o1" } as never);
    const res = await deleteOverride(jreq("http://x", undefined, "DELETE"), { params: params("o1") });
    expect(res.status).toBe(204);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "AssetTypeModelTemplate", entityId: "o1" })
    );
  });
});
