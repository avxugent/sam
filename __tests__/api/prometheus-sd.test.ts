import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { asset: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prometheus-auth", () => ({ checkPrometheusAuth: vi.fn() }));
// location-path is mocked to keep the test focused on target/address handling;
// scrape-template is intentionally NOT mocked so template rendering is real.
vi.mock("@/lib/location-path", () => ({
  resolveLocationPath: vi.fn(async () => []),
  parseFiNumber: vi.fn(() => null),
  buildLocationPathString: vi.fn(() => ""),
  findFiNumber: vi.fn(() => null),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { GET } from "@/app/api/prometheus/sd/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.asset.findMany);
const mockCheckAuth = vi.mocked(checkPrometheusAuth);

function req() {
  return new NextRequest("http://localhost/api/prometheus/sd");
}
function adminSession() {
  return { user: { id: "u1", role: "ADMIN", name: "A", email: "a@test.com" } };
}

type AssetRow = {
  id: string;
  hostname: string | null;
  model: string | null;
  serialNumber: string | null;
  vaultPath: string | null;
  locationId: string;
  manufacturerId: string | null;
  location: { inMaintenance: boolean } | null;
  type: {
    name: string;
    scrapeTargetTemplate: string | null;
    prometheusExposed: boolean;
    manufacturerTemplates: { manufacturerId: string; scrapeTargetTemplate: string }[];
  } | null;
  manufacturer: { name: string } | null;
};

function asset(overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "a1",
    hostname: "rectest001.ugent.be",
    model: "Pearl",
    serialNumber: "SN1",
    vaultPath: "secret/av/rectest001",
    locationId: "loc1",
    manufacturerId: "m1",
    location: { inMaintenance: false },
    type: { name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: true, manufacturerTemplates: [] },
    manufacturer: { name: "Epiphan" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckAuth.mockReturnValue(null); // auth passes by default
});

describe("GET /api/prometheus/sd", () => {
  it("returns 401 when not admin and bearer token check fails", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockCheckAuth.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("uses the hostname as the target when no template is set", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([asset()] as never);

    const res = await GET(req());
    const groups = await res.json();

    expect(res.status).toBe(200);
    expect(groups).toHaveLength(1);
    expect(groups[0].targets).toEqual(["rectest001.ugent.be"]);
    expect(groups[0].labels.__scheme__).toBeUndefined();
    expect(groups[0].labels.sam_hostname).toBe("rectest001.ugent.be");
  });

  it("lifts a template __address__ into the target and __scheme__ into labels", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([
      asset({
        type: {
          name: "Recorder",
          prometheusExposed: true,
          scrapeTargetTemplate:
            "__address__=https://pearlexporterdev.ugent.be\n" +
            "__metrics_path__=/probe\n" +
            "__param_target=https://{hostname_fqdn}",
          manufacturerTemplates: [],
        },
      }),
    ] as never);

    const res = await GET(req());
    const groups = await res.json();

    // Exporter is the scrape target, not the device — Bug 2 regression guard.
    expect(groups[0].targets).toEqual(["pearlexporterdev.ugent.be"]);
    expect(groups[0].labels.__scheme__).toBe("https");
    // __address__ must be removed so it does not collide with the target entry.
    expect(groups[0].labels.__address__).toBeUndefined();
    expect(groups[0].labels.__metrics_path__).toBe("/probe");
    expect(groups[0].labels.__param_target).toBe("https://rectest001.ugent.be");
  });

  it("skips asset types that are not exposed to Prometheus", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([
      asset({
        type: { name: "Recorder", scrapeTargetTemplate: null, prometheusExposed: false },
      }),
    ] as never);

    const res = await GET(req());
    const groups = await res.json();
    expect(groups).toHaveLength(0);
    expect(res.headers.get("X-SAM-Target-Count")).toBe("0");
  });

  it("skips assets whose room is in maintenance", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([
      asset({ location: { inMaintenance: true } }),
    ] as never);

    const res = await GET(req());
    const groups = await res.json();
    expect(groups).toHaveLength(0);
    expect(res.headers.get("X-SAM-Target-Count")).toBe("0");
  });

  it("uses the manufacturer-specific override when one matches the asset's brand", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([
      asset({
        manufacturerId: "m1",
        type: {
          name: "Recorder",
          prometheusExposed: true,
          scrapeTargetTemplate: "__address__=https://default-exporter.ugent.be",
          manufacturerTemplates: [
            { manufacturerId: "m1", scrapeTargetTemplate: "__address__=https://epiphan-exporter.ugent.be" },
          ],
        },
      }),
    ] as never);

    const res = await GET(req());
    const groups = await res.json();
    expect(groups[0].targets).toEqual(["epiphan-exporter.ugent.be"]);
  });

  it("falls back to the type default when no override matches the asset's manufacturer", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindMany.mockResolvedValue([
      asset({
        manufacturerId: "m2",
        type: {
          name: "Recorder",
          prometheusExposed: true,
          scrapeTargetTemplate: "__address__=https://default-exporter.ugent.be",
          manufacturerTemplates: [
            { manufacturerId: "m1", scrapeTargetTemplate: "__address__=https://epiphan-exporter.ugent.be" },
          ],
        },
      }),
    ] as never);

    const res = await GET(req());
    const groups = await res.json();
    expect(groups[0].targets).toEqual(["default-exporter.ugent.be"]);
  });
});
