/**
 * GET /api/assets/by-hostname?hostname=<value>
 *
 * Looks up one or more assets by hostname and returns their full SAM
 * metadata including location path. Designed for use with the Grafana
 * Infinity datasource plugin for metadata lookup panels.
 *
 * Authentication: Standard NextAuth session (session cookie) OR
 *                 Bearer token (PROMETHEUS_SD_TOKEN) — whichever is present.
 *
 * Returns:
 *   - 200: array of matching assets (may be empty, may have >1 if duplicates exist)
 *   - 400: missing hostname parameter
 *   - 401: unauthenticated
 *
 * Grafana Infinity datasource example:
 *
 *   URL:  https://sam.example.com/api/assets/by-hostname?hostname=${hostname_var}
 *   Auth: Bearer token header
 *         Key: Authorization
 *         Value: Bearer <PROMETHEUS_SD_TOKEN>
 *
 *   JSONPath root: $[*]
 *   Columns:
 *     $.hostname        → Hostname    (string)
 *     $.type.name       → Type        (string)
 *     $.manufacturer.name → Manufacturer (string)
 *     $.model           → Model       (string)
 *     $.serialNumber    → Serial      (string)
 *     $.location.path   → Location    (string)
 *     $.location.fiNumber → FI Number (string)
 *     $.installationDate  → Installed  (string)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { hasBearerToken } from "@/lib/bearer-token";
import {
  resolveLocationPath,
  buildLocationPathString,
  findFiNumber,
  parseFiNumber,
} from "@/lib/location-path";
import { toIsoDay } from "@/lib/utils";

/** Check either session cookie OR Bearer token */
async function checkAuth(req: NextRequest): Promise<boolean> {
  // Option 1: valid NextAuth session
  // (a partly signed-in session, still owing a login step, does not count)
  const session = await auth();
  if (session?.user && !(await signInIncompleteResponse(session))) return true;

  // Option 2: Prometheus bearer token (allows Grafana server-side queries)
  return hasBearerToken(req, process.env.PROMETHEUS_SD_TOKEN);
}

export async function GET(req: NextRequest) {
  const authorized = await checkAuth(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const hostname = searchParams.get("hostname")?.trim();

  if (!hostname) {
    return NextResponse.json(
      { error: "Missing required query parameter: hostname" },
      { status: 400 }
    );
  }

  const assets = await prisma.asset.findMany({
    // Decommissioned assets are historical, not current inventory — excluded
    // from this metadata lookup, same as /api/prometheus/sd.
    where: { hostname, status: "INSTALLED" },
    include: {
      type: { select: { id: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
      model: { select: { name: true } },
      macAddresses: { select: { id: true, address: true } },
      customFields: { select: { id: true, key: true, value: true } },
      location: {
        select: {
          id: true,
          name: true,
          fiNumber: true,
          address: true,
          city: true,
          country: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Enrich each asset with the resolved location path
  const enriched = await Promise.all(
    assets.map(async (asset) => {
      const ancestors = await resolveLocationPath(asset.locationId);
      const fiNumber = findFiNumber(ancestors);
      const fiParts = parseFiNumber(fiNumber);
      const pathString = buildLocationPathString(ancestors);

      return {
        id: asset.id,
        hostname: asset.hostname,
        model: asset.model?.name ?? null,
        serialNumber: asset.serialNumber,
        installationDate: toIsoDay(asset.installationDate),
        invoiceNumber: asset.invoiceNumber,
        notes: asset.notes,
        type: asset.type,
        manufacturer: asset.manufacturer,
        macAddresses: asset.macAddresses.map((m) => m.address),
        customFields: asset.customFields,
        location: {
          id: asset.location.id,
          name: asset.location.name,
          fiNumber: asset.location.fiNumber,
          address: asset.location.address,
          city: asset.location.city,
          country: asset.location.country,
          // Full resolved path from root
          path: pathString,
          // Decoded FI segments (from the deepest FI number in the ancestor chain)
          fiNumberResolved: fiNumber,
          campus: fiParts?.campus ?? null,
          building: fiParts?.building ?? null,
          floor: fiParts?.floor ?? null,
          room: fiParts?.room ?? null,
          // Array of ancestor names for programmatic use
          ancestors: ancestors.map((a) => ({
            id: a.id,
            name: a.name,
            fiNumber: a.fiNumber,
          })),
        },
      };
    })
  );

  return NextResponse.json(enriched, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
