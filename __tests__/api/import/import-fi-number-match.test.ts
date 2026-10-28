import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { findMany: vi.fn(), upsert: vi.fn() },
    manufacturer: { findMany: vi.fn(), upsert: vi.fn() },
    supplier: { findMany: vi.fn(), upsert: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    location: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    model: { findMany: vi.fn() },
    asset: { create: vi.fn() },
    appSetting: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST } from "@/app/api/import/route";
import { POST as preview } from "@/app/api/import/preview/route";

const mockAuth = vi.mocked(auth);
const mockAssetCreate = vi.mocked(prisma.asset.create);
const mockLocationCreate = vi.mocked(prisma.location.create);

function session(role = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } } as never;
}

function importReq(csv: string): NextRequest {
  const file = {
    name: "import.csv",
    type: "text/csv",
    text: async () => csv,
  };
  return {
    formData: async () => ({ get: (key: string) => (key === "file" ? file : null) }),
    headers: new Headers(),
  } as unknown as NextRequest;
}

const HEADER =
  "CAMPUS;GEBOUW;LOKAAL;FI NUMMER;TYPE;BRAND;MODEL;SERIAL;MAC;IP_HOSTNAME;INSTALL_DATE;Factuurdatum;Factuurnummer;OWNER;CRITICALITY;END_OF_SUPPORT;SUPPLIER";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session());
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.model.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
  mockLocationCreate.mockImplementation(
    (async (args: { data: { name: string } }) => ({ id: `loc-${args.data.name}` })) as never
  );
  vi.mocked(prisma.assetType.upsert).mockResolvedValue({ id: "type-1" } as never);
  vi.mocked(prisma.manufacturer.upsert).mockResolvedValue({ id: "mfr-1" } as never);
  vi.mocked(prisma.supplier.upsert).mockResolvedValue({ id: "sup-1" } as never);
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  mockAssetCreate.mockResolvedValue({ id: "a1" } as never);
});

describe("POST /api/import — authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(importReq(`${HEADER}\n`));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles (EDITOR)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR"));
    const res = await POST(importReq(`${HEADER}\n`));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/import — FI NUMMER-based location match", () => {
  it("reuses the existing location when FI NUMMER matches, even if CAMPUS/GEBOUW/LOKAAL text differs", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([
      { id: "room-existing", name: "Old Room Name", parentId: "bldg-1", fiNumber: "14.10.100.13" },
    ] as never);

    const csv = `${HEADER}\nCampus X;Building Y;Renamed Room;14.10.100.13;Display;Dell;U2723;SN1;;;;;;;;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.created).toBe(1);

    // No new location should be created — the FI NUMMER match short-circuits
    // CAMPUS/GEBOUW/LOKAAL creation entirely.
    expect(mockLocationCreate).not.toHaveBeenCalled();
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationId: "room-existing" }),
      })
    );
  });

  it("falls back to name-based matching when FI NUMMER is absent or unknown", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);

    const csv = `${HEADER}\nC;G;Room 1;;Display;Dell;U2723;SN1;;;;;;;;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.created).toBe(1);
    expect(mockLocationCreate).toHaveBeenCalled();
  });
});

describe("POST /api/import — FI NUMMER applied to an existing room", () => {
  const existing = [
    { id: "campus", name: "Campus", parentId: null, fiNumber: null },
    { id: "bldg", name: "Bldg", parentId: "campus", fiNumber: null },
    { id: "room-a", name: "Room A", parentId: "bldg", fiNumber: "14.10.100.001" },
  ];

  it("does not route later rows to a room whose own FI number blocked the update", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue(existing as never);
    vi.mocked(prisma.location.updateMany).mockResolvedValue({ count: 0 } as never); // room already has an FI number
    const csv = [
      HEADER,
      "Campus;Bldg;Room A;14.10.100.002;Laptop;;;;;;;;;;;;",
      "Other;Annex;Room B;14.10.100.002;Laptop;;;;;;;;;;;;",
    ].join("\n");
    await POST(importReq(csv));
    const locationIds = mockAssetCreate.mock.calls.map(([arg]) => (arg as { data: { locationId: string } }).data.locationId);
    expect(locationIds[0]).toBe("room-a");
    // Second row must get its own room, not be merged into Room A via a phantom FI mapping.
    expect(locationIds[1]).toBe("loc-Room B");
    expect(mockLocationCreate).toHaveBeenCalledWith({ data: { name: "Room B", parentId: "loc-Annex", fiNumber: "14.10.100.002" } });
  });

  it("records the FI number when the update applied", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue(
      existing.map((l) => (l.id === "room-a" ? { ...l, fiNumber: null } : l)) as never
    );
    vi.mocked(prisma.location.updateMany).mockResolvedValue({ count: 1 } as never);
    const csv = [
      HEADER,
      "Campus;Bldg;Room A;14.10.100.002;Laptop;;;;;;;;;;;;",
      "Renamed;Elsewhere;Room X;14.10.100.002;Laptop;;;;;;;;;;;;",
    ].join("\n");
    await POST(importReq(csv));
    const locationIds = mockAssetCreate.mock.calls.map(([arg]) => (arg as { data: { locationId: string } }).data.locationId);
    expect(locationIds).toEqual(["room-a", "room-a"]);
  });
});

describe("POST /api/import/preview", () => {
  it("is admin-only like the import itself", async () => {
    mockAuth.mockResolvedValue(session("EDITOR"));
    expect((await preview(importReq(`${HEADER}\n`))).status).toBe(403);
  });

  it("returns the column names and at most five preview rows, writing nothing", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => `C;B;Room ${i};;;;;;;;;;;;;;`);
    const res = await preview(importReq([HEADER, ...rows].join("\n")));
    const body = await res.json();
    expect(body.totalRows).toBe(7);
    expect(body.preview).toHaveLength(5);
    expect(body.columns).toContain("LOKAAL");
    expect(mockAssetCreate).not.toHaveBeenCalled();
  });
});
