import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/model-clusters", () => ({
  getModelClusters: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { getModelClusters } from "@/lib/model-clusters";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/models/clusters/route";

const mockAuth = vi.mocked(auth);
const mockGetModelClusters = vi.mocked(getModelClusters);

const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/models/clusters", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the clusters from getModelClusters()", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockGetModelClusters.mockResolvedValue([
      [
        { id: "mo1", model: "PowerEdge R740", count: 5, typeName: "Server", manufacturerName: "Dell" },
        { id: "mo2", model: "poweredge r740", count: 2, typeName: "Server", manufacturerName: "Dell" },
      ],
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clusters).toEqual([
      [
        { id: "mo1", model: "PowerEdge R740", count: 5, typeName: "Server", manufacturerName: "Dell" },
        { id: "mo2", model: "poweredge r740", count: 2, typeName: "Server", manufacturerName: "Dell" },
      ],
    ]);
  });
});
