/**
 * Hostname compliance reporting for NIS2. Measures, per asset type, how many
 * INSTALLED assets have a hostname matching the type's configured regex
 * (`AssetType.hostnamePattern`) — or, when no pattern is set, the generic FQDN
 * check. Assets with no hostname are excluded from the rate and reported
 * separately.
 */
import { prisma } from "@/lib/prisma";
import { isHostnameCompliant } from "@/lib/hostname/pattern";
import { getLocationPathsBatch } from "@/lib/locations/path";

export type NonCompliantAsset = {
  id: string;
  hostname: string;
  model: string | null;
  serialNumber: string | null;
  locationPath: string | null;
  fiNumber: string | null;
};

export type TypeCompliance = {
  typeId: string | null;
  typeName: string;
  pattern: string | null; // null => measured against the FQDN fallback
  measured: number; // assets with a hostname (rate denominator)
  compliant: number;
  nonCompliant: number;
  noHostname: number; // excluded from the rate, surfaced for context
  rate: number | null; // compliant / measured, null when measured === 0
  nonCompliantAssets: NonCompliantAsset[];
};

export type HostnameComplianceResult = {
  types: TypeCompliance[];
  overall: { measured: number; compliant: number; nonCompliant: number; rate: number | null };
};

const NO_TYPE_KEY = "__none__";

export async function computeHostnameCompliance(): Promise<HostnameComplianceResult> {
  const [types, assets] = await Promise.all([
    prisma.assetType.findMany({ select: { id: true, name: true, hostnamePattern: true } }),
    prisma.asset.findMany({
      where: { status: "INSTALLED" },
      select: {
        id: true,
        typeId: true,
        hostname: true,
        model: { select: { name: true } },
        serialNumber: true,
        locationId: true,
        location: { select: { fiNumber: true } },
      },
    }),
  ]);

  const typeMap = new Map(types.map((t) => [t.id, t]));

  const locationIds = [
    ...new Set(assets.map((a) => a.locationId).filter((id): id is string => !!id)),
  ];
  const pathMap = await getLocationPathsBatch(locationIds);

  const buckets = new Map<string, TypeCompliance>();
  function bucketFor(typeId: string | null): TypeCompliance {
    const key = typeId ?? NO_TYPE_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      const t = typeId ? typeMap.get(typeId) : undefined;
      bucket = {
        typeId,
        typeName: t?.name ?? "No type",
        pattern: t?.hostnamePattern ?? null,
        measured: 0,
        compliant: 0,
        nonCompliant: 0,
        noHostname: 0,
        rate: null,
        nonCompliantAssets: [],
      };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const a of assets) {
    const bucket = bucketFor(a.typeId);
    const hostname = a.hostname?.trim();
    if (!hostname) {
      bucket.noHostname++;
      continue;
    }
    bucket.measured++;
    if (isHostnameCompliant(hostname, bucket.pattern)) {
      bucket.compliant++;
    } else {
      bucket.nonCompliant++;
      bucket.nonCompliantAssets.push({
        id: a.id,
        hostname,
        model: a.model?.name ?? null,
        serialNumber: a.serialNumber,
        locationPath: a.locationId ? pathMap.get(a.locationId) ?? null : null,
        fiNumber: a.location?.fiNumber ?? null,
      });
    }
  }

  const typesArr = [...buckets.values()];
  for (const b of typesArr) {
    b.rate = b.measured > 0 ? b.compliant / b.measured : null;
    b.nonCompliantAssets.sort((x, y) => x.hostname.localeCompare(y.hostname));
  }

  // Worst-first: lowest rate leads; types with no measurable assets sink to the bottom.
  typesArr.sort((a, b) => {
    if (a.rate === null && b.rate === null) return a.typeName.localeCompare(b.typeName);
    if (a.rate === null) return 1;
    if (b.rate === null) return -1;
    return a.rate - b.rate || a.typeName.localeCompare(b.typeName);
  });

  const measured = typesArr.reduce((s, b) => s + b.measured, 0);
  const compliant = typesArr.reduce((s, b) => s + b.compliant, 0);
  const nonCompliant = typesArr.reduce((s, b) => s + b.nonCompliant, 0);

  return {
    types: typesArr,
    overall: {
      measured,
      compliant,
      nonCompliant,
      rate: measured > 0 ? compliant / measured : null,
    },
  };
}
