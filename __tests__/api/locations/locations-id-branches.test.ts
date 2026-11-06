import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    location: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    attachment: { findUnique: vi.fn(), findMany: vi.fn() },
    asset: { count: vi.fn() },
    stockItem: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/locations/path", () => ({ getAllDescendantLocationIds: vi.fn(), getSubtreeIdsDeepestFirst: vi.fn() }));
vi.mock("@/lib/uploads/storage", () => ({ deleteStoredFiles: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getAllDescendantLocationIds, getSubtreeIdsDeepestFirst } from "@/lib/locations/path";
import { deleteStoredFiles } from "@/lib/uploads/storage";
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
  vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.attachment.findMany).mockResolvedValue([] as never);
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

  it("409 locationNameExists when renaming onto a sibling", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old", parentId: "p1", parent: null } as never);
    vi.mocked(prisma.location.findFirst).mockResolvedValue({ id: "loc2", name: "New" } as never);
    const res = await PUT(put({ name: "New" }), { params: params() });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j).toEqual({ error: "A sibling location already has this name.", code: "locationNameExists", existingId: "loc2", existingName: "New" });
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it("404 when the location is deleted between the read and the update (P2025)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "loc1", name: "Old" } as never);
    vi.mocked(prisma.location.update).mockRejectedValue({ code: "P2025" });
    const res = await PUT(put({ description: "x" }), { params: params() });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Location not found." });
  });
  it("400 unknownReference when the new parent is deleted after the check (P2003)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique)
      .mockResolvedValueOnce({ id: "loc1", name: "Old", parentId: null } as never)
      .mockResolvedValueOnce({ id: "p2" } as never);
    vi.mocked(prisma.location.update).mockRejectedValue({ code: "P2003" });
    const res = await PUT(put({ parentId: "p2" }), { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "unknownReference", error: "Target location does not exist." });
  });
  it("400 when moving a location into itself", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await PUT(put({ parentId: "loc1" }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/its own parent/);
  });

  it("400 when the target parent does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique)
      .mockResolvedValueOnce({ id: "loc1", name: "Room", parent: null } as never)
      .mockResolvedValueOnce(null as never);
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

  it("404 before any other check when the location does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    const res = await PUT(put({ name: "New", inMaintenance: true }), { params: params() });
    expect(res.status).toBe(404);
    expect(prisma.location.count).not.toHaveBeenCalled();
    expect(prisma.location.update).not.toHaveBeenCalled();
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
  it("404 when the location does not exist", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(404);
    expect(prisma.location.delete).not.toHaveBeenCalled();
  });
  it("403 when an editor deletes a location that has sub-locations", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Building" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(2 as never);
    const req = new NextRequest("http://localhost/api/locations/loc1?cascade=true", { method: "DELETE" });
    expect((await DELETE(req, { params: params() })).status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("lets an editor delete a leaf location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.location.delete).mockResolvedValue({} as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(200);
  });
  it("404 when the location is deleted between the read and the delete (P2025)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.location.delete).mockRejectedValue({ code: "P2025" });
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(404);
    expect(deleteStoredFiles).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
  it("admin cascade removes the subtree's stored files and audits how much went with it", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Building" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(1 as never);
    mockDescendants.mockResolvedValue(["child1", "child2"]);
    vi.mocked(getSubtreeIdsDeepestFirst).mockResolvedValue(["child2", "child1", "loc1"]);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.attachment.findMany).mockResolvedValue([{ path: "locations/child1/a.png" }, { path: "assets/as1/b.pdf" }] as never);
    const req = new NextRequest("http://localhost/api/locations/loc1?cascade=true", { method: "DELETE" });
    const res = await DELETE(req, { params: params() });
    expect(res.status).toBe(200);
    const ids = ["loc1", "child1", "child2"];
    expect(prisma.attachment.findMany).toHaveBeenCalledWith({
      where: { path: { not: null }, OR: [{ locationId: { in: ids } }, { asset: { locationId: { in: ids } } }] },
      select: { path: true },
    });
    expect(deleteStoredFiles).toHaveBeenCalledWith(["locations/child1/a.png", "assets/as1/b.pdf"]);
    expect(vi.mocked(prisma.$transaction).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteStoredFiles).mock.invocationCallOrder[0]
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { snapshot: { Name: "Building" }, cascade: { locations: 3, assets: 4 } } })
    );
  });
  it("400 when the location still has sub-locations", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(2 as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "hasSublocations" });
  });
  it("400 when the leaf location still holds stock", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.stockItem.count).mockResolvedValue(3 as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "hasStock" });
    expect(prisma.location.delete).not.toHaveBeenCalled();
  });
  it("400 when cascading and a descendant still holds stock", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room" } as never);
    vi.mocked(prisma.location.count).mockResolvedValue(2 as never);
    mockDescendants.mockResolvedValue(["child1", "child2"]);
    vi.mocked(prisma.stockItem.count).mockResolvedValue(1 as never);
    const req = new NextRequest("http://localhost/api/locations/loc1?cascade=true", { method: "DELETE" });
    const res = await DELETE(req, { params: params() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "hasStock" });
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
