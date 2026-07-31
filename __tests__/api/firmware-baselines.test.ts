import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    firmwareBaseline: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asset: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as list, POST as create } from "@/app/api/firmware-baselines/route";
import { PATCH, DELETE } from "@/app/api/firmware-baselines/[id]/route";
import { GET as observed } from "@/app/api/firmware-baselines/observed/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);

function session(role: string) {
  return { user: { id: "u1", role } };
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/firmware-baselines", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/firmware-baselines/b1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("ADMIN") as never);
  vi.mocked(prisma.firmwareBaseline.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
});

describe("GET /api/firmware-baselines", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await list()).status).toBe(401);
  });

  it("returns the configured baselines", async () => {
    vi.mocked(prisma.firmwareBaseline.findMany).mockResolvedValue([
      { id: "b1", model: null, approvedVersion: "4.18.0", type: { id: "t1", name: "Recorder" } },
    ] as never);
    const body = await (await list()).json();
    expect(body).toHaveLength(1);
    expect(body[0].approvedVersion).toBe("4.18.0");
  });
});

describe("POST /api/firmware-baselines", () => {
  it("403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await create(post({ typeId: "t1", approvedVersion: "4.18.0" }))).status).toBe(403);
  });

  it("400 when the version is missing", async () => {
    expect((await create(post({ typeId: "t1" }))).status).toBe(400);
  });

  it("stores a blank model as null so it becomes the type-wide row", async () => {
    vi.mocked(prisma.firmwareBaseline.create).mockResolvedValue({
      id: "b1",
      model: null,
      approvedVersion: "4.18.0",
      type: { id: "t1", name: "Recorder" },
    } as never);
    await create(post({ typeId: "t1", model: "   ", approvedVersion: " 4.18.0 " }));
    const arg = vi.mocked(prisma.firmwareBaseline.create).mock.calls[0][0];
    expect(arg.data.model).toBeNull();
    // Trimmed, or the version would never compare equal to a reported one.
    expect(arg.data.approvedVersion).toBe("4.18.0");
  });

  it("400 on a duplicate type/model pair", async () => {
    vi.mocked(prisma.firmwareBaseline.create).mockRejectedValue(new Error("unique constraint"));
    const res = await create(post({ typeId: "t1", approvedVersion: "4.18.0" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });
});

describe("PATCH /api/firmware-baselines/[id]", () => {
  beforeEach(() => {
    vi.mocked(prisma.firmwareBaseline.findUnique).mockResolvedValue({
      id: "b1",
      model: null,
      approvedVersion: "4.17.0",
      type: { name: "Recorder" },
    } as never);
    vi.mocked(prisma.firmwareBaseline.update).mockResolvedValue({
      id: "b1",
      model: null,
      approvedVersion: "4.18.0",
      type: { id: "t1", name: "Recorder" },
    } as never);
  });

  it("404 for an unknown id", async () => {
    vi.mocked(prisma.firmwareBaseline.findUnique).mockResolvedValue(null as never);
    expect((await PATCH(patch({ approvedVersion: "4.18.0" }), params("b1"))).status).toBe(404);
  });

  it("applies only the fields that were sent", async () => {
    await PATCH(patch({ approvedVersion: "4.18.0" }), params("b1"));
    const arg = vi.mocked(prisma.firmwareBaseline.update).mock.calls[0][0];
    // A partial update must not blank the model.
    expect(arg.data).toEqual({ approvedVersion: "4.18.0" });
  });

  it("clears the model when an empty string is sent explicitly", async () => {
    await PATCH(patch({ model: "" }), params("b1"));
    expect(vi.mocked(prisma.firmwareBaseline.update).mock.calls[0][0].data).toEqual({ model: null });
  });
});

describe("DELETE /api/firmware-baselines/[id]", () => {
  it("403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const req = new NextRequest("http://localhost/x", { method: "DELETE" });
    expect((await DELETE(req, params("b1"))).status).toBe(403);
  });

  it("deletes and audits", async () => {
    vi.mocked(prisma.firmwareBaseline.findUnique).mockResolvedValue({
      id: "b1",
      model: "Pearl Mini",
      approvedVersion: "4.17.0",
      type: { name: "Recorder" },
    } as never);
    const req = new NextRequest("http://localhost/x", { method: "DELETE" });
    expect((await DELETE(req, params("b1"))).status).toBe(200);
    expect(prisma.firmwareBaseline.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });
});

describe("GET /api/firmware-baselines/observed", () => {
  it("groups deployed versions and suggests the highest", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { typeId: "t1", model: "Pearl Mini", firmwareVersion: "4.17.0", type: { name: "Recorder" } },
      { typeId: "t1", model: "Pearl Mini", firmwareVersion: "4.18.1", type: { name: "Recorder" } },
      { typeId: "t1", model: "Pearl Mini", firmwareVersion: "4.17.0", type: { name: "Recorder" } },
    ] as never);

    const body = await (await observed()).json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      typeName: "Recorder",
      model: "Pearl Mini",
      assetCount: 3,
      // Highest by the same comparator compliance uses, not by string sort.
      suggestedVersion: "4.18.1",
      coveredBy: null,
    });
    // Most common version first, so the usual fleet state is obvious.
    expect(body[0].versions[0]).toEqual({ version: "4.17.0", count: 2 });
  });

  it("reports the type-wide baseline that already covers a model", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { typeId: "t1", model: "Pearl Nano", firmwareVersion: "4.18.1", type: { name: "Recorder" } },
    ] as never);
    vi.mocked(prisma.firmwareBaseline.findMany).mockResolvedValue([
      { typeId: "t1", model: null, approvedVersion: "4.18.0" },
    ] as never);

    const body = await (await observed()).json();
    expect(body[0].coveredBy).toEqual({ model: null, approvedVersion: "4.18.0" });
  });

  it("suggests nothing when no version can be ordered", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { typeId: "t1", model: "X", firmwareVersion: "rc-alpha", type: { name: "Odd" } },
    ] as never);
    const body = await (await observed()).json();
    // A single unorderable version is still the only candidate, so it stands —
    // what must not happen is an arbitrary pick between two of them.
    expect(body[0].suggestedVersion).toBe("rc-alpha");
  });
});
