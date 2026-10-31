import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
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
import {
  GET as listGet,
  POST as listPost,
} from "@/app/api/locations/[id]/work-logs/route";

const mockAuth = vi.mocked(auth);
const mockWlFindMany = vi.mocked(prisma.workLog.findMany);
const mockWlCreate = vi.mocked(prisma.workLog.create);
const mockLocFindUnique = vi.mocked(prisma.location.findUnique);

function editorSession(id = "ed-1") {
  return { user: { id, role: "EDITOR", email: `${id}@x`, name: id } };
}
function viewerSession() {
  return { user: { id: "view-1", role: "VIEWER", email: "v@x", name: "V" } };
}

const SAMPLE_LOG = {
  id: "wl-1",
  locationId: "loc-1",
  assetId: null,
  performedById: "ed-1",
  performedAt: new Date("2026-04-20"),
  description: "Cleaned filter",
  jiraIssueKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, method: string, body?: object) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => { vi.clearAllMocks(); });

// ── List ─────────────────────────────────────────────────────────────────────

describe("GET /api/locations/[id]/work-logs", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await listGet(makeReq("http://x/api/locations/loc-1/work-logs", "GET"), {
      params: Promise.resolve({ id: "loc-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the list for any authenticated user", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockWlFindMany.mockResolvedValue([SAMPLE_LOG] as never);
    const res = await listGet(makeReq("http://x/api/locations/loc-1/work-logs", "GET"), {
      params: Promise.resolve({ id: "loc-1" }),
    });
    expect(res.status).toBe(200);
  });
});

// ── Create ───────────────────────────────────────────────────────────────────

describe("POST /api/locations/[id]/work-logs", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", { description: "x" }),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", { description: "x" }),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing description", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockLocFindUnique.mockResolvedValue({ id: "loc-1", name: "L" } as never);
    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", {}),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid jira key format", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockLocFindUnique.mockResolvedValue({ id: "loc-1", name: "L" } as never);
    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", {
        description: "Cleaned",
        jiraIssueKey: "not-a-key",
      }),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 if location does not exist", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockLocFindUnique.mockResolvedValue(null as never);
    const res = await listPost(
      makeReq("http://x/api/locations/loc-x/work-logs", "POST", { description: "x" }),
      { params: Promise.resolve({ id: "loc-x" }) }
    );
    expect(res.status).toBe(404);
  });

  it("creates entry as EDITOR with defaults", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockLocFindUnique.mockResolvedValue({ id: "loc-1", name: "L" } as never);
    mockWlCreate.mockResolvedValue(SAMPLE_LOG as never);

    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", { description: "Cleaned" }),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(201);
    expect(mockWlCreate).toHaveBeenCalledOnce();
    const call = mockWlCreate.mock.calls[0][0];
    expect(call.data.performedById).toBe("ed-1");
  });

  it("returns 400 unknownReference for a stale asset, item or performer id", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockLocFindUnique.mockResolvedValue({ id: "loc-1", name: "L" } as never);
    mockWlCreate.mockRejectedValue(Object.assign(new Error("fk"), { code: "P2003" }));
    const res = await listPost(
      makeReq("http://x/api/locations/loc-1/work-logs", "POST", { description: "Cleaned", assetId: "gone" }),
      { params: Promise.resolve({ id: "loc-1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknownReference");
  });
});
