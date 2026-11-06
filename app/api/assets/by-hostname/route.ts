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
 *   - 400: missing or over-long hostname parameter
 *   - 401: unauthenticated
 *   - 503: no session and PROMETHEUS_SD_TOKEN is not configured
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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sessionOrIntegrationTokenResponse } from "@/lib/tokens/session-or-integration";
import { getLocationAncestors } from "@/lib/locations/path";
import { locationLabelPath, findFiNumber, parseFiNumber } from "@/lib/locations/tree";
import { toIsoDay } from "@/lib/dates";
import { invalidInput } from "@/lib/route-helpers";

// Same cap as an asset's hostname.
const querySchema = z.object({
  hostname: z.string().trim().min(1).max(255),
});

export async function GET(req: NextRequest) {
  // Any signed-in role, or the integration token (Grafana server-side queries).
  const authError = await sessionOrIntegrationTokenResponse(req, () => true);
  if (authError) return authError;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return invalidInput(parsed.error);
  const { hostname } = parsed.data;

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
      const ancestors = await getLocationAncestors(asset.locationId);
      const fiNumber = findFiNumber(ancestors);
      const fiParts = parseFiNumber(fiNumber);
      const pathString = locationLabelPath(ancestors);

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
