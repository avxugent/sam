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
  "CAMPUS;GEBOUW;LOKAAL;FI NUMMER;TYPE;BRAND;MODEL;SERIAL;QUANTITY;MAC;IP_HOSTNAME;INSTALL_DATE";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session());
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.model.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.location.create).mockImplementation(
    (async (args: { data: { name: string } }) => ({ id: `loc-${args.data.name}` })) as never
  );
  vi.mocked(prisma.assetType.upsert).mockResolvedValue({ id: "type-1" } as never);
  vi.mocked(prisma.manufacturer.upsert).mockResolvedValue({ id: "mfr-1" } as never);
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  mockAssetCreate.mockResolvedValue({ id: "a1" } as never);
});

describe("POST /api/import — QUANTITY column", () => {
  it("sets quantity on a bulk row with no serial, hostname, or MAC", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Battery;Duracell;AA;;10;;;`;
    const res = await POST(importReq(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 10 }) })
    );
    // No more free-text custom field for quantity.
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customFields: undefined,
        }),
      })
    );
  });

  it("ignores QUANTITY and defaults to 1 when the row has a serial number", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Recorder;Epson;R1;SN-123;5;;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors.some((e: string) => /QUANTITY 5 ignored/.test(e))).toBe(true);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1, serialNumber: "SN-123" }) })
    );
  });

  it("defaults to 1 and flags a non-numeric QUANTITY value", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Battery;Duracell;AA;;lots;;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors.some((e: string) => /not a positive integer/.test(e))).toBe(true);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1 }) })
    );
  });

  it("defaults to 1 when QUANTITY is absent", async () => {
    const csv = `${HEADER}\nC;G;Room 1;;Battery;Duracell;AA;;;;;`;
    const res = await POST(importReq(csv));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1 }) })
    );
  });
});
