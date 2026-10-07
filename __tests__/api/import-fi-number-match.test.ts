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

const mockAuth = vi.mocked(auth);
const mockAssetCreate = vi.mocked(prisma.asset.create);
const mockLocationCreate = vi.mocked(prisma.location.create);

function session() {
  return { user: { id: "u1", role: "ADMIN", name: "T", email: "t@test.com" } } as never;
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
