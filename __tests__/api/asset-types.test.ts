import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asset: {
      count: vi.fn(),
    },
    model: {
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET, POST } from "@/app/api/asset-types/route";
import { PUT, DELETE } from "@/app/api/asset-types/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.assetType.findMany);
const mockCreate = vi.mocked(prisma.assetType.create);
const mockUpdate = vi.mocked(prisma.assetType.update);
const mockDelete = vi.mocked(prisma.assetType.delete);
const mockAssetCount = vi.mocked(prisma.asset.count);
const mockModelCount = vi.mocked(prisma.model.count);

function adminSession() {
  return { user: { id: "u1", role: "ADMIN", name: "Admin", email: "admin@test.com" } };
}
function viewerSession() {
  return { user: { id: "u2", role: "VIEWER", name: "Viewer", email: "viewer@test.com" } };
}
function makeReq(method: string, body?: object) {
  return new NextRequest("http://localhost/api/asset-types", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function makeIdReq(method: string, body?: object) {
  return new NextRequest("http://localhost/api/asset-types/type-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/asset-types ──────────────────────────────────────────────────────

describe("GET /api/asset-types", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the list of asset types for any authenticated user", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindMany.mockResolvedValue([
      { id: "1", name: "Projector", scrapeTargetTemplate: null, createdAt: new Date(), _count: { assets: 5 } },
    ] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Projector");
  });
});

// ── POST /api/asset-types ─────────────────────────────────────────────────────

describe("POST /api/asset-types", () => {
  it("returns 403 for non-admin users", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await POST(makeReq("POST", { name: "Monitor" }));
    expect(res.status).toBe(403);
  });

  it("creates a new asset type as admin", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockCreate.mockResolvedValue({ id: "2", name: "Monitor", createdAt: new Date() } as never);
    const res = await POST(makeReq("POST", { name: "Monitor" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Monitor");
  });

  it("returns 400 for empty name", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    const res = await POST(makeReq("POST", { name: "" }));
    expect(res.status).toBe(400);
  });
});

// ── PUT /api/asset-types/[id] ─────────────────────────────────────────────────

describe("PUT /api/asset-types/[id]", () => {
  const params = Promise.resolve({ id: "type-1" });

  it("returns 403 for non-admin", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await PUT(makeIdReq("PUT", { name: "Updated" }), { params });
    expect(res.status).toBe(403);
  });

  it("updates name as admin", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findFirst).mockResolvedValue(null as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Updated" } as never);
    const res = await PUT(makeIdReq("PUT", { name: "Updated" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  it("returns 409 with existingId when name already taken", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findFirst).mockResolvedValue({ id: "type-2", name: "Existing" } as never);
    const res = await PUT(makeIdReq("PUT", { name: "Existing" }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe("name");
    expect(body.existingId).toBe("type-2");
  });

  it("returns 400 for invalid template syntax", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    const res = await PUT(makeIdReq("PUT", {
      scrapeTargetTemplate: "no-equals-sign\n",
    }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Template syntax error");
  });

  it("accepts a valid scrape template", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Recorder", scrapeTargetTemplate: "__address__=https://exporter.example.com" } as never);
    const res = await PUT(makeIdReq("PUT", {
      scrapeTargetTemplate: "__address__=https://exporter.example.com",
    }), { params });
    expect(res.status).toBe(200);
  });

  it("updates prometheusExposed flag", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "type-1", name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: true } as never);
    vi.mocked(prisma.assetType.findFirst).mockResolvedValue(null as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: false } as never);
    const res = await PUT(makeIdReq("PUT", { prometheusExposed: false }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prometheusExposed).toBe(false);
  });

  it("rejects non-boolean prometheusExposed", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    const res = await PUT(makeIdReq("PUT", { prometheusExposed: "yes" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid hostname pattern", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    const res = await PUT(makeIdReq("PUT", { hostnamePattern: "(unclosed" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid hostname pattern");
  });

  it("saves a valid hostname pattern", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({
      name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: true, hostnamePattern: null,
    } as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Recorder", hostnamePattern: "^rec-\\d{3}\\.ugent\\.be$" } as never);
    const res = await PUT(makeIdReq("PUT", { hostnamePattern: "^rec-\\d{3}\\.ugent\\.be$" }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ hostnamePattern: "^rec-\\d{3}\\.ugent\\.be$" }),
    }));
  });

  it("clears the hostname pattern when set to null", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({
      name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: true, hostnamePattern: "^rec-\\d{3}$",
    } as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Recorder", hostnamePattern: null } as never);
    const res = await PUT(makeIdReq("PUT", { hostnamePattern: null }), { params });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ hostnamePattern: null }),
    }));
  });

  it("leaves the hostname pattern untouched when not part of the request", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findFirst).mockResolvedValue(null as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Updated" } as never);
    await PUT(makeIdReq("PUT", { name: "Updated" }), { params });
    const dataArg = (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dataArg).not.toHaveProperty("hostnamePattern");
  });

  it("leaves the scrape template untouched when only defaultCriticality is sent", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({
      name: "Recorder", scrapeTargetTemplate: "__address__=https://exporter.example.com", prometheusExposed: true, hostnamePattern: null, defaultCriticality: null,
    } as never);
    mockUpdate.mockResolvedValue({ id: "type-1", name: "Recorder", defaultCriticality: "HIGH" } as never);
    await PUT(makeIdReq("PUT", { defaultCriticality: "HIGH" }), { params });
    const dataArg = (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(dataArg).not.toHaveProperty("scrapeTargetTemplate");
  });
});

// ── DELETE /api/asset-types/[id] ──────────────────────────────────────────────

describe("DELETE /api/asset-types/[id]", () => {
  const params = Promise.resolve({ id: "type-1" });

  it("returns 403 for non-admin", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when assets reference this type", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockAssetCount.mockResolvedValue(3);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/3 asset/);
  });

  it("deletes when no assets reference this type", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockAssetCount.mockResolvedValue(0);
    mockModelCount.mockResolvedValue(0);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "type-1", name: "Server" } as never);
    mockDelete.mockResolvedValue({ id: "type-1" } as never);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
