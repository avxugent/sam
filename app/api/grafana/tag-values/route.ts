import { NextRequest, NextResponse } from "next/server";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const key: string = body?.key ?? "";

  if (key === "type") {
    const types = await prisma.assetType.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(types.map((t) => ({ text: t.name })));
  }
  if (key === "manufacturer") {
    const mfs = await prisma.manufacturer.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(mfs.map((m) => ({ text: m.name })));
  }
  if (key === "location") {
    const locs = await prisma.location.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(locs.map((l) => ({ text: l.name })));
  }
  if (key === "hostname") {
    const assets = await prisma.asset.findMany({
      // Decommissioned assets are historical, not current inventory — their
      // hostnames are excluded from this Grafana variable dropdown.
      where: { status: "INSTALLED", hostname: { not: null } },
      select: { hostname: true },
      orderBy: { hostname: "asc" },
    });
    return NextResponse.json(assets.map((a) => ({ text: a.hostname! })));
  }

  return NextResponse.json([]);
}
