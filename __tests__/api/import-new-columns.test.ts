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
    asset: { create: vi.fn() },
    appSetting: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST } from "@/app/api/import/route";

const mockAuth = vi.mocked(auth);
const mockAssetCreate = vi.mocked(prisma.asset.create);

function session() {
  return { user: { id: "u1", role: "ADMIN", name: "T", email: "t@test.com" } } as never;
}

// jsdom's File doesn't survive undici's multipart round-trip, so stub the
// parts of NextRequest the route actually touches (formData + headers).
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
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: "owner-1", email: "jane@x.y" },
  ] as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.location.create).mockImplementation(
    (async (args: { data: { name: string } }) => ({ id: `loc-${args.data.name}` })) as never
  );
  vi.mocked(prisma.assetType.upsert).mockResolvedValue({ id: "type-1" } as never);
  vi.mocked(prisma.manufacturer.upsert).mockResolvedValue({ id: "mfr-1" } as never);
  vi.mocked(prisma.supplier.upsert).mockResolvedValue({ id: "sup-1" } as never);
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  mockAssetCreate.mockResolvedValue({ id: "a1" } as never);
});

describe("POST /api/import — OWNER/CRITICALITY/END_OF_SUPPORT/SUPPLIER columns", () => {
  it("applies owner (by email), criticality, end-of-support and supplier (auto-created)", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Display;Dell;U2723;SN1;;;2024-01-15;;;jane@x.y;high;2030-06-30;CampusStore`;
    const res = await POST(importReq(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);

    expect(prisma.supplier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "CampusStore" } })
    );
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner-1",
          criticality: "HIGH",
          endOfSupportDate: expect.any(Date),
          supplierId: "sup-1",
        }),
      })
    );
  });

  it("warns on unmatched owner email and invalid criticality, storing null", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Display;Dell;U2723;SN1;;;;;;nobody@x.y;EXTREME;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors.join(" ")).toMatch(/OWNER "nobody@x.y"/);
    expect(body.errors.join(" ")).toMatch(/CRITICALITY "EXTREME"/);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: null, criticality: null, supplierId: null }),
      })
    );
  });

  it("falls back to creation defaults when OWNER/SUPPLIER cells are empty", async () => {
    vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({ value: "team-user" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "team-user" } as never);
    vi.mocked(prisma.supplier.findMany).mockImplementation((async (args?: { where?: unknown; select?: unknown }) => {
      // resolveAssetCreationDefaults queries windows; the import preload selects names
      if (args && JSON.stringify(args).includes("defaultFrom")) {
        return [{ id: "sup-win", defaultFrom: new Date("2000-01-01"), defaultUntil: null }];
      }
      return [];
    }) as never);

    const csv = `${HEADER}\nC;G;Room 1;;Display;Dell;U2723;SN1;;;;;;;;;`;
    const res = await POST(importReq(csv));
    expect(res.status).toBe(200);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "team-user", supplierId: "sup-win" }),
      })
    );
  });
});
