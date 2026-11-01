/**
 * Point-in-time JSON inventory snapshot (NIS2 evidence). Consumed by
 * GET /api/export/snapshot and scripts/export-backup.mjs.
 */
import { prisma } from "@/lib/prisma";
import { effectiveCriticality } from "@/lib/criticality";
import { toIsoDay } from "@/lib/dates";
import type { AssetStatus, Criticality, DisposalMethod } from "@/generated/prisma/enums";

export type InventorySnapshot = {
  generatedAt: string;
  counts: { assets: number; locations: number; suppliers: number };
  assets: Array<{
    id: string;
    status: AssetStatus;
    typeName: string | null;
    manufacturerName: string | null;
    model: string | null;
    serialNumber: string | null;
    hostname: string | null;
    macAddresses: string[];
    locationId: string;
    installationDate: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    ownerId: string | null;
    criticality: Criticality | null;
    effectiveCriticality: Criticality | null;
    endOfSupportDate: string | null;
    supplierId: string | null;
    disposalMethod: DisposalMethod | null;
    decommissionedAt: string | null;
  }>;
  suppliers: Array<{
    id: string;
    name: string;
    contractReference: string | null;
    defaultFrom: string | null;
    defaultUntil: string | null;
  }>;
  locations: Array<{
    id: string;
    name: string;
    parentId: string | null;
    fiNumber: string | null;
  }>;
};

export async function buildInventorySnapshot(): Promise<InventorySnapshot> {
  const [assets, suppliers, locations] = await Promise.all([
    prisma.asset.findMany({
      include: {
        type: { select: { name: true, defaultCriticality: true } },
        manufacturer: { select: { name: true } },
        model: { select: { name: true } },
        macAddresses: { select: { address: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({
      select: { id: true, name: true, parentId: true, fiNumber: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      assets: assets.length,
      locations: locations.length,
      suppliers: suppliers.length,
    },
    assets: assets.map((a) => ({
      id: a.id,
      status: a.status,
      typeName: a.type?.name ?? null,
      manufacturerName: a.manufacturer?.name ?? null,
      model: a.model?.name ?? null,
      serialNumber: a.serialNumber,
      hostname: a.hostname,
      macAddresses: a.macAddresses.map((m) => m.address),
      locationId: a.locationId,
      installationDate: toIsoDay(a.installationDate),
      invoiceNumber: a.invoiceNumber,
      invoiceDate: toIsoDay(a.invoiceDate),
      ownerId: a.ownerId,
      criticality: a.criticality,
      effectiveCriticality: effectiveCriticality(a.criticality, a.type?.defaultCriticality),
      endOfSupportDate: toIsoDay(a.endOfSupportDate),
      supplierId: a.supplierId,
      disposalMethod: a.disposalMethod,
      decommissionedAt: a.decommissionedAt ? a.decommissionedAt.toISOString() : null,
    })),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contractReference: s.contractReference,
      defaultFrom: toIsoDay(s.defaultFrom),
      defaultUntil: toIsoDay(s.defaultUntil),
    })),
    locations,
  };
}
