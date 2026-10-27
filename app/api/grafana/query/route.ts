import { NextRequest, NextResponse } from "next/server";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { toIsoDay } from "@/lib/utils";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { grafanaQuerySchema, type AdhocFilter, type AdhocFilterKey } from "@/lib/schemas/grafana";

/** Where clause each ad-hoc filter key applies for an "=" filter. */
const ADHOC_WHERE: Record<AdhocFilterKey, (value: string) => Prisma.AssetWhereInput> = {
  hostname: (value) => ({ hostname: value }),
  type: (value) => ({ type: { name: value } }),
  manufacturer: (value) => ({ manufacturer: { name: value } }),
  location: (value) => ({ location: { name: value } }),
};

function buildWhereFromAdhoc(filters: AdhocFilter[]): Prisma.AssetWhereInput {
  // Decommissioned assets are historical, not current inventory — excluded
  // from every Grafana target below (there is no adhoc filter to opt back in).
  const conditions: Prisma.AssetWhereInput[] = [{ status: "INSTALLED" }];
  for (const f of filters) {
    if (f.operator === "=" && Object.hasOwn(ADHOC_WHERE, f.key)) {
      conditions.push(ADHOC_WHERE[f.key as AdhocFilterKey](f.value));
    }
  }
  return { AND: conditions };
}

function tableResponse(columns: { text: string; type: string }[], rows: (string | number | null)[][]) {
  return { columns, rows, type: "table" };
}

export async function POST(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  const parsed = grafanaQuerySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const { targets, adhocFilters } = parsed.data;
  const adhocWhere = buildWhereFromAdhoc(adhocFilters);

  const results = await Promise.all(
    targets.map(async ({ target }) => {
      if (target === "assets_table") {
        const assets = await prisma.asset.findMany({
          where: adhocWhere,
          include: {
            type: { select: { name: true } },
            manufacturer: { select: { name: true } },
            model: { select: { name: true } },
            location: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });
        return tableResponse(
          [
            { text: "Model", type: "string" },
            { text: "Serial", type: "string" },
            { text: "Hostname", type: "string" },
            { text: "Type", type: "string" },
            { text: "Manufacturer", type: "string" },
            { text: "Location", type: "string" },
            { text: "InstallDate", type: "string" },
          ],
          assets.map((a) => [
            a.model?.name ?? null,
            a.serialNumber,
            a.hostname,
            a.type?.name ?? null,
            a.manufacturer?.name ?? null,
            a.location?.name ?? null,
            toIsoDay(a.installationDate),
          ])
        );
      }

      if (target === "assets_by_type") {
        const gb = await prisma.asset.groupBy({ by: ["typeId"], where: adhocWhere, _count: { id: true } });
        const typeIds = gb.map((g) => g.typeId).filter(Boolean) as string[];
        const types = await prisma.assetType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
        const typeMap = Object.fromEntries(types.map((t) => [t.id, t.name]));
        return tableResponse(
          [{ text: "Type", type: "string" }, { text: "Count", type: "number" }],
          gb.map((g) => [g.typeId ? (typeMap[g.typeId] ?? "Unknown") : "No type", g._count.id])
        );
      }

      if (target === "assets_by_manufacturer") {
        const gb = await prisma.asset.groupBy({ by: ["manufacturerId"], where: adhocWhere, _count: { id: true } });
        const mfIds = gb.map((g) => g.manufacturerId).filter(Boolean) as string[];
        const mfs = await prisma.manufacturer.findMany({ where: { id: { in: mfIds } }, select: { id: true, name: true } });
        const mfMap = Object.fromEntries(mfs.map((m) => [m.id, m.name]));
        return tableResponse(
          [{ text: "Manufacturer", type: "string" }, { text: "Count", type: "number" }],
          gb.map((g) => [g.manufacturerId ? (mfMap[g.manufacturerId] ?? "Unknown") : "No manufacturer", g._count.id])
        );
      }

      if (target === "assets_by_location") {
        const gb = await prisma.asset.groupBy({ by: ["locationId"], where: adhocWhere, _count: { id: true } });
        const locIds = gb.map((g) => g.locationId);
        const locs = await prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } });
        const locMap = Object.fromEntries(locs.map((l) => [l.id, l.name]));
        return tableResponse(
          [{ text: "Location", type: "string" }, { text: "Count", type: "number" }],
          gb.map((g) => [locMap[g.locationId] ?? "Unknown", g._count.id])
        );
      }

      if (target === "assets_by_install_year") {
        const assets = await prisma.asset.findMany({
          where: { ...adhocWhere, installationDate: { not: null } },
          select: { installationDate: true },
        });
        const yearMap = new Map<number, number>();
        for (const a of assets) {
          const year = a.installationDate!.getFullYear();
          yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
        }
        const sorted = Array.from(yearMap.entries()).sort((a, b) => a[0] - b[0]);
        return tableResponse(
          [{ text: "Year", type: "string" }, { text: "Count", type: "number" }],
          sorted.map(([year, count]) => [String(year), count])
        );
      }

      return tableResponse([], []);
    })
  );

  return NextResponse.json(results);
}
