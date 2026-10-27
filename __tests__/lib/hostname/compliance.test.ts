import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    assetType: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { computeHostnameCompliance } from "@/lib/hostname/compliance";

const mockTypeFind = vi.mocked(prisma.assetType.findMany);
const mockAssetFind = vi.mocked(prisma.asset.findMany);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

function a(typeId: string | null, hostname: string | null, id = hostname ?? "x") {
  return {
    id,
    typeId,
    hostname,
    model: "m",
    serialNumber: "sn",
    locationId: "room",
    location: { fiNumber: "14.10.100.013" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([{ id: "room", name: "Room 101", parentId: null }] as never);
});

describe("computeHostnameCompliance()", () => {
  it("only measures INSTALLED assets", async () => {
    mockTypeFind.mockResolvedValue([] as never);
    mockAssetFind.mockResolvedValue([] as never);
    await computeHostnameCompliance();
    expect(mockAssetFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "INSTALLED" } })
    );
  });

  it("measures a pattern-configured type and excludes no-hostname assets from the rate", async () => {
    mockTypeFind.mockResolvedValue([
      { id: "t1", name: "Web", hostnamePattern: "^web-\\d+\\.example\\.com$" },
    ] as never);
    mockAssetFind.mockResolvedValue([
      a("t1", "web-1.example.com"),
      a("t1", "web-2.example.com"),
      a("t1", "nope"), // non-compliant
      a("t1", null), // no hostname → excluded from rate
    ] as never);

    const { types } = await computeHostnameCompliance();
    const web = types.find((t) => t.typeId === "t1")!;
    expect(web.measured).toBe(3);
    expect(web.compliant).toBe(2);
    expect(web.nonCompliant).toBe(1);
    expect(web.noHostname).toBe(1);
    expect(web.rate).toBeCloseTo(2 / 3);
    expect(web.nonCompliantAssets).toHaveLength(1);
    expect(web.nonCompliantAssets[0]).toMatchObject({
      hostname: "nope",
      locationPath: "Room 101",
      fiNumber: "14.10.100.013",
    });
  });

  it("falls back to the generic FQDN check for a pattern-less type", async () => {
    mockTypeFind.mockResolvedValue([
      { id: "t2", name: "Server", hostnamePattern: null },
    ] as never);
    mockAssetFind.mockResolvedValue([
      a("t2", "host.dept.example.com"), // valid FQDN
      a("t2", "single-label"), // not an FQDN → non-compliant
    ] as never);

    const { types } = await computeHostnameCompliance();
    const srv = types.find((t) => t.typeId === "t2")!;
    expect(srv.pattern).toBeNull();
    expect(srv.compliant).toBe(1);
    expect(srv.nonCompliant).toBe(1);
    expect(srv.rate).toBeCloseTo(0.5);
  });

  it("yields a null rate for a type whose assets all lack a hostname", async () => {
    mockTypeFind.mockResolvedValue([
      { id: "t3", name: "Projector", hostnamePattern: null },
    ] as never);
    mockAssetFind.mockResolvedValue([a("t3", null, "p1"), a("t3", "", "p2")] as never);

    const { types } = await computeHostnameCompliance();
    const proj = types.find((t) => t.typeId === "t3")!;
    expect(proj.measured).toBe(0);
    expect(proj.noHostname).toBe(2);
    expect(proj.rate).toBeNull();
  });

  it("buckets typeless assets under a 'No type' row and aggregates the overall rate", async () => {
    mockTypeFind.mockResolvedValue([
      { id: "t1", name: "Web", hostnamePattern: "^web-\\d+\\.example\\.com$" },
    ] as never);
    mockAssetFind.mockResolvedValue([
      a("t1", "web-1.example.com"), // compliant
      a(null, "orphan.example.com"), // no type → FQDN fallback, compliant
      a(null, "bad"), // no type → non-compliant
    ] as never);

    const { types, overall } = await computeHostnameCompliance();
    const noType = types.find((t) => t.typeId === null)!;
    expect(noType.typeName).toBe("No type");
    expect(noType.measured).toBe(2);
    expect(noType.compliant).toBe(1);

    expect(overall.measured).toBe(3);
    expect(overall.compliant).toBe(2);
    expect(overall.nonCompliant).toBe(1);
    expect(overall.rate).toBeCloseTo(2 / 3);
  });

  it("sorts worst-compliance first and sinks measureless (null-rate) types to the bottom", async () => {
    mockTypeFind.mockResolvedValue([
      { id: "good", name: "Good", hostnamePattern: null },
      { id: "bad", name: "Bad", hostnamePattern: null },
      { id: "empty1", name: "Empty One", hostnamePattern: null },
      { id: "empty2", name: "Empty Two", hostnamePattern: null },
    ] as never);
    mockAssetFind.mockResolvedValue([
      a("good", "a.example.com", "g1"),
      a("good", "b.example.com", "g2"),
      a("bad", "b.example.com", "b1"),
      a("bad", "broken", "b2"),
      a("empty1", null, "e1"), // rate null
      a("empty2", null, "e2"), // rate null
    ] as never);

    const { types } = await computeHostnameCompliance();
    expect(types[0].typeId).toBe("bad"); // 0.5 rate leads over 1.0
    expect(types[1].typeId).toBe("good");
    // Both null-rate types sink to the end, ordered alphabetically between them.
    expect(types.slice(2).map((t) => t.typeName)).toEqual(["Empty One", "Empty Two"]);
  });
});
