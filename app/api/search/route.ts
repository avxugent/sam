/**
 * GET /api/search?q=<query>
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
 * Returns up to 50 asset results and 20 location results, ordered by
 * relevance (number of matching fields, most specific first).
 *
 * Authentication: standard NextAuth session.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const MAX_ASSET_RESULTS = 50;
const MAX_LOCATION_RESULTS = 20;
const MIN_QUERY_LENGTH = 2;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ assets: [], locations: [], query: q });
  }

  // ── Asset search ────────────────────────────────────────────────────────────
  // We search across many fields using OR conditions. Prisma's `where` with
  // nested OR handles this cleanly and avoids raw SQL injection risk.
  const assets = await prisma.asset.findMany({
    where: {
      status: "INSTALLED",
      OR: [
        { model: { contains: q } },
        { serialNumber: { contains: q } },
        { hostname: { contains: q } },
        { invoiceNumber: { contains: q } },
        { notes: { contains: q } },
        { type: { name: { contains: q } } },
        { manufacturer: { name: { contains: q } } },
        { macAddresses: { some: { address: { contains: q } } } },
        { customFields: { some: { value: { contains: q } } } },
        { customFields: { some: { key: { contains: q } } } },
        { location: { name: { contains: q } } },
        { location: { fiNumber: { contains: q } } },
        { location: { address: { contains: q } } },
        { location: { city: { contains: q } } },
      ],
    },
    select: {
      id: true,
      model: true,
      serialNumber: true,
      hostname: true,
      invoiceNumber: true,
      notes: true,
      locationId: true,
      type: { select: { id: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
      location: {
        select: {
          id: true,
          name: true,
          fiNumber: true,
          parentId: true,
        },
      },
    },
    take: MAX_ASSET_RESULTS,
    orderBy: { updatedAt: "desc" },
  });

  // Score each asset by how many fields matched — puts the most relevant results first
  const ql = q.toLowerCase();

  function scoreAsset(a: typeof assets[number]): number {
    let score = 0;
    if (a.model?.toLowerCase().includes(ql)) score += 10;
    if (a.hostname?.toLowerCase().includes(ql)) score += 10;
    if (a.serialNumber?.toLowerCase().includes(ql)) score += 10;
    if (a.type?.name.toLowerCase().includes(ql)) score += 8;
    if (a.manufacturer?.name.toLowerCase().includes(ql)) score += 8;
    if (a.macAddresses.some((m) => m.address.toLowerCase().includes(ql))) score += 7;
    if (a.invoiceNumber?.toLowerCase().includes(ql)) score += 6;
    if (a.location.name.toLowerCase().includes(ql)) score += 5;
    if (a.location.fiNumber?.toLowerCase().includes(ql)) score += 5;
    if (a.customFields.some((f) => f.value.toLowerCase().includes(ql))) score += 4;
    if (a.customFields.some((f) => f.key.toLowerCase().includes(ql))) score += 2;
    if (a.notes?.toLowerCase().includes(ql)) score += 1;
    return score;
  }

  const scoredAssets = assets
    .map((a) => ({ ...a, _score: scoreAsset(a) }))
    .sort((a, b) => b._score - a._score);

  // Build a highlight snippet showing which fields matched
  function buildSnippet(a: typeof assets[number]): string {
    const parts: string[] = [];
    if (a.model?.toLowerCase().includes(ql)) parts.push(`Model: ${a.model}`);
    if (a.serialNumber?.toLowerCase().includes(ql)) parts.push(`S/N: ${a.serialNumber}`);
    if (a.hostname?.toLowerCase().includes(ql)) parts.push(`Host: ${a.hostname}`);
    if (a.invoiceNumber?.toLowerCase().includes(ql)) parts.push(`Invoice: ${a.invoiceNumber}`);
    if (a.macAddresses.some((m) => m.address.toLowerCase().includes(ql))) {
      const mac = a.macAddresses.find((m) => m.address.toLowerCase().includes(ql));
      if (mac) parts.push(`MAC: ${mac.address}`);
    }
    if (a.customFields.some((f) => f.value.toLowerCase().includes(ql))) {
      const cf = a.customFields.find((f) => f.value.toLowerCase().includes(ql));
      if (cf) parts.push(`${cf.key}: ${cf.value}`);
    }
    if (a.notes?.toLowerCase().includes(ql)) {
      const idx = a.notes.toLowerCase().indexOf(ql);
      const start = Math.max(0, idx - 30);
      const end = Math.min(a.notes.length, idx + q.length + 30);
      parts.push(`Notes: …${a.notes.slice(start, end)}…`);
    }
    return parts.slice(0, 3).join(" · ");
  }

  const assetResults = scoredAssets.map((a) => ({
    id: a.id,
    model: a.model,
    serialNumber: a.serialNumber,
    hostname: a.hostname,
    type: a.type,
    manufacturer: a.manufacturer,
    location: a.location,
    snippet: buildSnippet(a),
    _score: a._score,
  }));

  // ── Location search ─────────────────────────────────────────────────────────
  const locations = await prisma.location.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { fiNumber: { contains: q } },
        { address: { contains: q } },
        { city: { contains: q } },
        { country: { contains: q } },
      ],
    },
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
    take: MAX_LOCATION_RESULTS,
    orderBy: { name: "asc" },
  });

  // Count installed assets across all descendants for each matched location
  // using a single batch recursive CTE (mirrors what the location detail page does).
  const installedAssetCounts: Record<string, number> = {};
  if (locations.length > 0) {
    const locationIds = locations.map((l) => l.id);
    const rows = await prisma.$queryRaw<{ rootId: string; assetCount: bigint }[]>`
      WITH RECURSIVE loc_tree AS (
        SELECT id, id AS rootId FROM locations WHERE id IN (${Prisma.join(locationIds)})
        UNION ALL
        SELECT l.id, lt.rootId FROM locations l
        INNER JOIN loc_tree lt ON l.parentId = lt.id
      )
      SELECT lt.rootId, COUNT(a.id) AS assetCount
      FROM loc_tree lt
      LEFT JOIN assets a ON a.locationId = lt.id AND a.status = 'INSTALLED'
      GROUP BY lt.rootId
    `;
    for (const row of rows) {
      installedAssetCounts[row.rootId] = Number(row.assetCount);
    }
  }

  function buildLocationSnippet(l: typeof locations[number]): string {
    const parts: string[] = [];
    if (l.fiNumber?.toLowerCase().includes(ql)) parts.push(`FI: ${l.fiNumber}`);
    if (l.address?.toLowerCase().includes(ql)) parts.push(l.address);
    if (l.city?.toLowerCase().includes(ql)) parts.push(l.city);
    if (l.description?.toLowerCase().includes(ql)) {
      const idx = l.description.toLowerCase().indexOf(ql);
      const start = Math.max(0, idx - 30);
      const end = Math.min(l.description.length, idx + q.length + 30);
      parts.push(`…${l.description.slice(start, end)}…`);
    }
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
    total: assetResults.length + locationResults.length,
  });
}
