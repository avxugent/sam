import { NextRequest, NextResponse } from "next/server";
import { integrationTokenError } from "@/lib/tokens/integration";
import { prisma } from "@/lib/prisma";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { grafanaTagValuesSchema, type AdhocFilterKey } from "@/lib/schemas/grafana";

/** Selectable values per ad-hoc filter key, as Grafana { text } entries. */
const TAG_VALUES: Record<AdhocFilterKey, () => Promise<string[]>> = {
  type: async () =>
    (await prisma.assetType.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map((t) => t.name),
  manufacturer: async () =>
    (await prisma.manufacturer.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map((m) => m.name),
  location: async () =>
    (await prisma.location.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map((l) => l.name),
  hostname: async () =>
    (
      await prisma.asset.findMany({
        // Decommissioned assets are historical, not current inventory — their
        // hostnames are excluded from this Grafana variable dropdown.
        where: { status: "INSTALLED", hostname: { not: null } },
        select: { hostname: true },
        orderBy: { hostname: "asc" },
      })
    ).map((a) => a.hostname!),
};

export async function POST(req: NextRequest) {
  const authError = integrationTokenError(req);
  if (authError) return authError;

  const parsed = grafanaTagValuesSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const { key } = parsed.data;

  if (Object.hasOwn(TAG_VALUES, key)) {
    const values = await TAG_VALUES[key as AdhocFilterKey]();
    return NextResponse.json(values.map((text) => ({ text })));
  }

  return NextResponse.json([]);
}
