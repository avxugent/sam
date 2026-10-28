/**
 * GET /api/search?q=<query>&page=<page>
 *
 * Full-text search across all asset attributes:
 *   - model, serialNumber, hostname, invoiceNumber, notes
 *   - type name, manufacturer name
 *   - MAC addresses
 *   - custom field keys and values
 *   - location name and FI number (the asset's direct location)
 *
 * Also searches locations independently:
 *   - name, description, fiNumber, address, city
 *
 * Returns paginated results (50 assets / 20 locations per page). Pages are cut
 * from the matches ordered by most recently updated; assets within a page are
 * then ranked by relevance (weighted matching fields, most specific first).
 * Ranking globally would require loading every match, so it is page-local.
 *
 * Authentication: standard NextAuth session.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRecursiveAssetCounts } from "@/lib/locations/path";

const ASSET_PAGE_SIZE = 50;
const LOCATION_PAGE_SIZE = 20;
const MIN_QUERY_LENGTH = 2;

const ASSET_SELECT = {
  id: true,
  model: { select: { id: true, name: true } },
  serialNumber: true,
  hostname: true,
  invoiceNumber: true,
  notes: true,
  locationId: true,
  type: { select: { id: true, name: true } },
  manufacturer: { select: { id: true, name: true } },
  macAddresses: { select: { address: true } },
  customFields: { select: { key: true, value: true } },
  location: { select: { id: true, name: true, fiNumber: true, parentId: true } },
} satisfies Prisma.AssetSelect;

type SearchAsset = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;

/** Case-insensitive substring test against an already lower-cased query. */
function hit(value: string | null | undefined, ql: string): boolean {
  return !!value && value.toLowerCase().includes(ql);
}

/** "…text around the match…" for long free-text fields. */
function excerpt(text: string, ql: string): string {
  const idx = text.toLowerCase().indexOf(ql);
  return text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + ql.length + 30));
}

/**
 * Every searchable asset field, in snippet order: how it is matched in the
 * database, how much a match ranks (0 = found but not ranked), and the
 * snippet line it contributes. The where clause, the score and the snippet
 * all read from this one list.
 */
const ASSET_SEARCH_FIELDS: {
  where: (q: string) => Prisma.AssetWhereInput;
  weight: number;
  matches?: (a: SearchAsset, ql: string) => boolean;
  snippet?: (a: SearchAsset, ql: string) => string;
}[] = [
  { where: (q) => ({ model: { name: { contains: q } } }), weight: 10, matches: (a, ql) => hit(a.model?.name, ql), snippet: (a) => `Model: ${a.model?.name}` },
  { where: (q) => ({ serialNumber: { contains: q } }), weight: 10, matches: (a, ql) => hit(a.serialNumber, ql), snippet: (a) => `S/N: ${a.serialNumber}` },
  { where: (q) => ({ hostname: { contains: q } }), weight: 10, matches: (a, ql) => hit(a.hostname, ql), snippet: (a) => `Host: ${a.hostname}` },
  { where: (q) => ({ invoiceNumber: { contains: q } }), weight: 6, matches: (a, ql) => hit(a.invoiceNumber, ql), snippet: (a) => `Invoice: ${a.invoiceNumber}` },
  {
    where: (q) => ({ macAddresses: { some: { address: { contains: q } } } }),
    weight: 7,
    matches: (a, ql) => a.macAddresses.some((m) => hit(m.address, ql)),
    snippet: (a, ql) => `MAC: ${a.macAddresses.find((m) => hit(m.address, ql))?.address}`,
  },
  {
    where: (q) => ({ customFields: { some: { value: { contains: q } } } }),
    weight: 4,
    matches: (a, ql) => a.customFields.some((f) => hit(f.value, ql)),
    snippet: (a, ql) => {
      const f = a.customFields.find((cf) => hit(cf.value, ql));
      return `${f?.key}: ${f?.value}`;
    },
  },
  { where: (q) => ({ notes: { contains: q } }), weight: 1, matches: (a, ql) => hit(a.notes, ql), snippet: (a, ql) => `Notes: …${excerpt(a.notes ?? "", ql)}…` },
  { where: (q) => ({ type: { name: { contains: q } } }), weight: 8, matches: (a, ql) => hit(a.type?.name, ql) },
  { where: (q) => ({ manufacturer: { name: { contains: q } } }), weight: 8, matches: (a, ql) => hit(a.manufacturer?.name, ql) },
  { where: (q) => ({ location: { name: { contains: q } } }), weight: 5, matches: (a, ql) => hit(a.location.name, ql) },
  { where: (q) => ({ location: { fiNumber: { contains: q } } }), weight: 5, matches: (a, ql) => hit(a.location.fiNumber, ql) },
  { where: (q) => ({ customFields: { some: { key: { contains: q } } } }), weight: 2, matches: (a, ql) => a.customFields.some((f) => hit(f.key, ql)) },
  // Found through the asset's location address, but not ranked or shown.
  { where: (q) => ({ location: { address: { contains: q } } }), weight: 0 },
  { where: (q) => ({ location: { city: { contains: q } } }), weight: 0 },
];

function scoreAsset(a: SearchAsset, ql: string): number {
  return ASSET_SEARCH_FIELDS.reduce((score, f) => (f.matches?.(a, ql) ? score + f.weight : score), 0);
}

function assetSnippet(a: SearchAsset, ql: string): string {
  return ASSET_SEARCH_FIELDS.filter((f) => f.snippet && f.matches?.(a, ql))
    .slice(0, 3)
    .map((f) => f.snippet!(a, ql))
    .join(" · ");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ assets: [], locations: [], query: q, total: 0, totalAssets: 0, totalLocations: 0, page: 1, assetPages: 0, locationPages: 0 });
  }

  const assetWhere = {
    status: "INSTALLED",
    OR: ASSET_SEARCH_FIELDS.map((f) => f.where(q)),
  } satisfies Prisma.AssetWhereInput;

  const locationWhere = {
    OR: [
      { name: { contains: q } },
      { description: { contains: q } },
      { fiNumber: { contains: q } },
      { address: { contains: q } },
      { city: { contains: q } },
      { country: { contains: q } },
    ],
  } satisfies Prisma.LocationWhereInput;

  const [totalAssets, totalLocations, assets, locations] = await Promise.all([
    prisma.asset.count({ where: assetWhere }),
    prisma.location.count({ where: locationWhere }),
    prisma.asset.findMany({
      where: assetWhere,
      select: ASSET_SELECT,
      skip: (page - 1) * ASSET_PAGE_SIZE,
      take: ASSET_PAGE_SIZE,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.location.findMany({
      where: locationWhere,
      select: {
        id: true,
        name: true,
        description: true,
        fiNumber: true,
        address: true,
        city: true,
        country: true,
        parentId: true,
        _count: { select: { children: true } },
      },
      skip: (page - 1) * LOCATION_PAGE_SIZE,
      take: LOCATION_PAGE_SIZE,
      orderBy: { name: "asc" },
    }),
  ]);

  // Rank this page's assets by which fields matched — most relevant first.
  const ql = q.toLowerCase();
  const scoredAssets = assets
    .map((a) => ({ ...a, _score: scoreAsset(a, ql) }))
    .sort((a, b) => b._score - a._score);

  const assetResults = scoredAssets.map((a) => ({
    id: a.id,
    model: a.model,
    serialNumber: a.serialNumber,
    hostname: a.hostname,
    type: a.type,
    manufacturer: a.manufacturer,
    location: a.location,
    snippet: assetSnippet(a, ql),
    _score: a._score,
  }));

  // Installed assets across each matched location's whole subtree
  const installedAssetCounts = await getRecursiveAssetCounts(locations.map((l) => l.id));

  function buildLocationSnippet(l: typeof locations[number]): string {
    const parts: string[] = [];
    if (l.fiNumber?.toLowerCase().includes(ql)) parts.push(`FI: ${l.fiNumber}`);
    if (l.address?.toLowerCase().includes(ql)) parts.push(l.address);
    if (l.city?.toLowerCase().includes(ql)) parts.push(l.city);
    if (hit(l.description, ql)) parts.push(`…${excerpt(l.description ?? "", ql)}…`);
    return parts.slice(0, 2).join(" · ");
  }

  const locationResults = locations.map((l) => ({
    ...l,
    snippet: buildLocationSnippet(l),
    _count: {
      assets: installedAssetCounts[l.id] ?? 0,
      children: l._count.children,
    },
  }));

  return NextResponse.json({
    query: q,
    assets: assetResults,
    locations: locationResults,
    total: totalAssets + totalLocations,
    totalAssets,
    totalLocations,
    page,
    assetPages: Math.ceil(totalAssets / ASSET_PAGE_SIZE),
    locationPages: Math.ceil(totalLocations / LOCATION_PAGE_SIZE),
  });
}
