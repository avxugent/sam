import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    location: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    attachment: { findUnique: vi.fn() },
    stockItem: { count: vi.fn() },
  },
}));
vi.mock("@/lib/location-path", () => ({ getAllDescendantLocationIds: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getAllDescendantLocationIds } from "@/lib/location-path";
import { GET, PUT, DELETE } from "@/app/api/locations/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const mockDescendants = vi.mocked(getAllDescendantLocationIds);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "loc1") => Promise.resolve({ id });
function put(body: object) {
  return new NextRequest("http://localhost/api/locations/loc1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function del() {
  return new NextRequest("http://localhost/api/locations/loc1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDescendants.mockResolvedValue([]);
  vi.mocked(prisma.stockItem.count).mockResolvedValue(0 as never);
});

describe("GET /api/locations/[id]", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(401);
  });
  it("404 when not found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(404);
  });
  it("returns the location when found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Room" } as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(200);
  });
});

describe("PUT /api/locations/[id]", () => {
  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await PUT(put({ name: "X" }), { params: params() })).status).toBe(403);
  });
  it("400 on invalid input", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await PUT(put({ fiNumber: "bad" }), { params: params() })).status).toBe(400);
  });
  it("400 when cover image is not a valid image attachment of this location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.attachment.findUnique).mockResolvedValue({ locationId: "other", mimeType: "image/png" } as never);
    expect((await PUT(put({ coverImageId: "att1" }), { params: params() })).status).toBe(400);
  });
  it("409 when fiNumber duplicate (P2002)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old" } as never);
    vi.mocked(prisma.location.update).mockRejectedValue({ code: "P2002" });
    expect((await PUT(put({ fiNumber: "14.10.100.013" }), { params: params() })).status).toBe(409);
  });
  it("rethrows non-P2002 update errors", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old" } as never);
    vi.mocked(prisma.location.update).mockRejectedValue(new Error("db"));
    await expect(PUT(put({ name: "New" }), { params: params() })).rejects.toThrow("db");
  });
  it("updates and records a field-change audit detail", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old", description: null, fiNumber: null, address: null, city: null, country: null, parentId: null, latitude: null, longitude: null, parent: null } as never);
    vi.mocked(prisma.location.update).mockResolvedValue({ id: "loc1", name: "New", parent: null } as never);
    const res = await PUT(put({ name: "New", city: "Ghent" }), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "Location",
        detail: { changes: expect.objectContaining({ Name: { from: "Old", to: "New" }, City: { from: null, to: "Ghent" } }) },
      })
    );
  });

  it("records every changed field including parent rename", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({
      id: "loc1", name: "Old", description: "od", fiNumber: "14.10.100.000", address: "oa", city: "oc", country: "oco",
      parentId: "p1", latitude: 1, longitude: 2, parent: { name: "Parent A" },
    } as never);
    vi.mocked(prisma.location.update).mockResolvedValue({ id: "loc1", name: "New", parent: { name: "Parent B" } } as never);
    const res = await PUT(put({
      name: "New", description: "nd", fiNumber: "14.10.100.013", address: "na", city: "nc", country: "nco",
      parentId: "p2", latitude: 3, longitude: 4,
    }), { params: params() });
    expect(res.status).toBe(200);
    const detail = mockLogAudit.mock.calls[0][0].detail as { changes: Record<string, unknown> };
    expect(Object.keys(detail.changes).sort()).toEqual(
      ["Address", "City", "Country", "Description", "FI number", "Latitude", "Longitude", "Name", "Parent"].sort()
    );
  });

  it("accepts a valid cover image of this location and logs no field changes", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.attachment.findUnique).mockResolvedValue({ locationId: "loc1", mimeType: "image/jpeg" } as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Room", description: null, fiNumber: null, address: null, city: null, country: null, parentId: null, latitude: null, longitude: null, parent: null } as never);
    vi.mocked(prisma.location.update).mockResolvedValue({ id: "loc1", name: "Room", parent: null } as never);
    const res = await PUT(put({ coverImageId: "att1" }), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: undefined }));
  });

  it("409 LOCATION_NAME_EXISTS when renaming onto a sibling", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old", parentId: "p1", parent: null } as never);
    vi.mocked(prisma.location.findFirst).mockResolvedValue({ id: "loc2", name: "New" } as never);
    const res = await PUT(put({ name: "New" }), { params: params() });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j).toEqual({ error: "LOCATION_NAME_EXISTS", targetId: "loc2", targetName: "New" });
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it("400 when moving a location into itself", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await PUT(put({ parentId: "loc1" }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/its own parent/);
  });

  it("400 when the target parent does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    const res = await PUT(put({ parentId: "p2" }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not exist/);
  });

  it("400 when moving a location into one of its own sub-locations", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "p2" } as never);
    mockDescendants.mockResolvedValue(["p2"]);
    const res = await PUT(put({ parentId: "p2" }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sub-location/);
  });

  it("handles a missing 'before' record (no changes block)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.location.update).mockResolvedValue({ id: "loc1", name: "New", parent: null } as never);
    const res = await PUT(put({ name: "New" }), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: undefined }));
  });

  it("places a leaf room in maintenance and audits the change", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never); // no children → is a room
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Room", inMaintenance: false, parent: null } as never);
    vi.mocked(prisma.location.update).mockResolvedValue({ id: "loc1", name: "Room", parent: null } as never);
    const res = await PUT(put({ inMaintenance: true }), { params: params() });
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.location.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ inMaintenance: true }) })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { changes: { "In maintenance": { from: false, to: true } } } })
    );
  });

  it("400 when placing a non-leaf location in maintenance", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(3 as never); // has children → not a room
    const res = await PUT(put({ inMaintenance: true }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only rooms/);
    expect(prisma.location.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/locations/[id]", () => {
  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(403);
  });
  it("400 when the location still has sub-locations", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(2 as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "HAS_SUBLOCATIONS" });
  });
  it("400 when the leaf location still holds stock", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.stockItem.count).mockResolvedValue(3 as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "HAS_STOCK" });
    expect(prisma.location.delete).not.toHaveBeenCalled();
  });
  it("400 when cascading and a descendant still holds stock", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(2 as never);
    mockDescendants.mockResolvedValue(["child1", "child2"]);
    vi.mocked(prisma.stockItem.count).mockResolvedValue(1 as never);
    const req = new NextRequest("http://localhost/api/locations/loc1?cascade=true", { method: "DELETE" });
    const res = await DELETE(req, { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "HAS_STOCK" });
    expect(vi.mocked(prisma.stockItem.count)).toHaveBeenCalledWith({
      where: { locationId: { in: ["loc1", "child1", "child2"] } },
    });
  });
  it("deletes a leaf location and audits a snapshot", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room", fiNumber: "14.10.100.013", address: null, city: "Ghent", country: null } as never);
    vi.mocked(prisma.location.delete).mockResolvedValue({} as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "Location", entityName: "Room", detail: { snapshot: expect.objectContaining({ Name: "Room", City: "Ghent" }) } })
    );
  });
});
