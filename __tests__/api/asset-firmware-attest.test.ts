import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PUT, DELETE } from "@/app/api/assets/[id]/firmware/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const params = { params: Promise.resolve({ id: "a1" }) };

function session(role: string) {
  return { user: { id: "u1", role } };
}

function put(body: unknown) {
  return new NextRequest("http://localhost/api/assets/a1/firmware", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

const del = () => new NextRequest("http://localhost/api/assets/a1/firmware", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("EDITOR") as never);
  vi.mocked(prisma.asset.findUnique).mockResolvedValue({
    id: "a1",
    hostname: "proj001",
    firmwareVersion: null,
    firmwareSource: null,
  } as never);
  vi.mocked(prisma.asset.update).mockResolvedValue({} as never);
});

describe("PUT /api/assets/[id]/firmware", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await PUT(put({ version: "1.08" }), params)).status).toBe(401);
  });

  it("403 for a viewer", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await PUT(put({ version: "1.08" }), params)).status).toBe(403);
  });

  it("404 for an unknown asset", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null as never);
    expect((await PUT(put({ version: "1.08" }), params)).status).toBe(404);
  });

  it("400 without a version", async () => {
    expect((await PUT(put({}), params)).status).toBe(400);
  });

  it("records the version, who attested it, and when", async () => {
    await PUT(put({ version: " 1.08 " }), params);
    const arg = vi.mocked(prisma.asset.update).mock.calls[0][0];
    expect(arg.data.firmwareVersion).toBe("1.08");
    expect(arg.data.firmwareSource).toBe("ATTESTED");
    expect(arg.data.firmwareAttestedById).toBe("u1");
    // The timestamp is what makes an attestation age out rather than counting
    // as evidence forever.
    expect(arg.data.firmwareCheckedAt).toBeInstanceOf(Date);
  });
});

describe("DELETE /api/assets/[id]/firmware", () => {
  it("clears an attested version", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      id: "a1",
      hostname: "proj001",
      firmwareVersion: "1.08",
      firmwareSource: "ATTESTED",
    } as never);
    expect((await DELETE(del(), params)).status).toBe(200);
    expect(vi.mocked(prisma.asset.update).mock.calls[0][0].data).toEqual({
      firmwareVersion: null,
      firmwareCheckedAt: null,
      firmwareSource: null,
      firmwareAttestedById: null,
    });
  });

  it("refuses to clear a version the device reported", async () => {
    // The exporter owns that value; clearing it would just be undone by the
    // next sync, so failing loudly is more honest than a no-op.
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      id: "a1",
      hostname: "rec001",
      firmwareVersion: "4.18.1",
      firmwareSource: "REPORTED",
    } as never);
    const res = await DELETE(del(), params);
    expect(res.status).toBe(400);
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });
});
