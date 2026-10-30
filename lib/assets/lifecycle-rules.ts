import type { AssetStatus, DisposalMethod, Prisma } from "@/generated/prisma/client";
import { parseStockMetadata, serializeStockMetadata } from "@/lib/stock-metadata";

/**
 * Pure lifecycle rules: the checks and update-data builders shared by the
 * single-asset and bulk decommission / repair / return-to-stock routes, so
 * both enforce identical validation. lib/assets/transitions.ts performs the
 * writes and audit entries on top of these.
 */
export type LifecycleViolationCode =
  | "ALREADY_DECOMMISSIONED"
  | "ALREADY_IN_REPAIR"
  | "NOT_DECOMMISSIONED"
  | "MISSING_TYPE"
  | "MISSING_MODEL";

/** Why a transition is not allowed: `code` for bulk results, `message` for a 400. */
export type LifecycleViolation = { code: LifecycleViolationCode; message: string };

const violation = (code: LifecycleViolationCode, message: string): LifecycleViolation => ({ code, message });

export function decommissionViolation(asset: { status: AssetStatus }): LifecycleViolation | null {
  if (asset.status === "DECOMMISSIONED") return violation("ALREADY_DECOMMISSIONED", "Asset is already decommissioned.");
  return null;
}

export function repairViolation(asset: { status: AssetStatus }): LifecycleViolation | null {
  if (asset.status === "DECOMMISSIONED") {
    return violation("ALREADY_DECOMMISSIONED", "Decommissioned assets cannot be sent for repair.");
  }
  if (asset.status === "IN_REPAIR") return violation("ALREADY_IN_REPAIR", "Asset is already sent for repair.");
  return null;
}

export function returnToStockViolation(asset: {
  status: AssetStatus;
  typeId: string | null;
  modelId: string | null;
}): LifecycleViolation | null {
  if (asset.status === "DECOMMISSIONED") {
    return violation("ALREADY_DECOMMISSIONED", "Decommissioned assets cannot be returned to stock.");
  }
  if (!asset.typeId) return violation("MISSING_TYPE", "Asset must have a type to be returned to stock.");
  if (!asset.modelId) return violation("MISSING_MODEL", "Asset must have a model to be returned to stock.");
  return null;
}

/** An asset that passed returnToStockViolation: it has a type and a model. */
export type Returnable<T> = T & { typeId: string; modelId: string };

/** returnToStockViolation(), plus the asset narrowed to Returnable when there is none. */
export function checkReturnToStock<T extends { status: AssetStatus; typeId: string | null; modelId: string | null }>(
  asset: T
): { violation: LifecycleViolation; asset?: undefined } | { violation: null; asset: Returnable<T> } {
  const violation = returnToStockViolation(asset);
  return violation ? { violation } : { violation: null, asset: asset as Returnable<T> };
}

export function reinstateViolation(asset: { status: AssetStatus }): LifecycleViolation | null {
  if (asset.status !== "DECOMMISSIONED") return violation("NOT_DECOMMISSIONED", "Asset is not decommissioned.");
  return null;
}

/** Undoes a decommission: back to installed, disposal evidence cleared. */
export function buildReinstateUpdateData(): Prisma.AssetUpdateInput {
  return {
    status: "INSTALLED",
    decommissionedAt: null,
    decommissionNote: null,
    disposalMethod: null,
    decommissionedById: null,
  };
}

type ReturnableAsset = {
  lineageId: string;
  typeId: string | null;
  manufacturerId: string | null;
  modelId: string | null;
  serialNumber: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  notes: string | null;
  hostname: string | null;
  warrantyMonths: number | null;
  vaultPath: string | null;
  macAddresses: { address: string }[];
  customFields: { key: string; value: string }[];
};

/** The exact `tx.stockItem.create({ data })` payload for a returned asset. */
export function buildStockItemFromReturn(
  asset: Returnable<ReturnableAsset>,
  locationId: string
): Prisma.StockItemUncheckedCreateInput {
  return {
    lineageId: asset.lineageId,
    typeId: asset.typeId,
    manufacturerId: asset.manufacturerId,
    modelId: asset.modelId,
    serialNumber: asset.serialNumber,
    invoiceNumber: asset.invoiceNumber,
    invoiceDate: asset.invoiceDate,
    notes: asset.notes,
    quantity: 1,
    locationId,
    metadata: serializeStockMetadata({
      macAddresses: asset.macAddresses,
      customFields: asset.customFields,
      hostname: asset.hostname || undefined,
      warrantyMonths: asset.warrantyMonths ?? undefined,
      vaultPath: asset.vaultPath || undefined,
    }),
  };
}

/** The exact `prisma.asset.update({ data })` payload for decommissioning. */
export function buildDecommissionUpdateData(params: {
  note: string | null;
  disposalMethod: DisposalMethod;
  actorId: string;
  location: { name: string; fiNumber: string | null };
}): Prisma.AssetUpdateInput {
  return {
    status: "DECOMMISSIONED",
    decommissionedAt: new Date(),
    decommissionNote: params.note,
    disposalMethod: params.disposalMethod,
    decommissionedById: params.actorId,
    lastLocationName: params.location.name,
    lastLocationFiNumber: params.location.fiNumber ?? null,
    repairStartedAt: null,
    repairNote: null,
    sentForRepairById: null,
  };
}

/** The exact `prisma.asset.update({ data })` payload for sending an asset for repair. */
export function buildSendForRepairUpdateData(params: {
  note: string | null;
  actorId: string;
}): Prisma.AssetUpdateInput {
  return {
    status: "IN_REPAIR",
    repairStartedAt: new Date(),
    repairNote: params.note,
    sentForRepairById: params.actorId,
  };
}

type DeployableStockItem = {
  lineageId: string;
  typeId: string | null;
  manufacturerId: string | null;
  modelId: string | null;
  serialNumber: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  metadata: string | null;
};

/**
 * Create data for one asset deployed from `stockItem` — the inverse of
 * buildStockItemFromReturn. The identity kept in the metadata (hostname,
 * warranty, vault path, MACs, custom fields) only applies when a single unit
 * is deployed. The lineage carries over only when this deploy consumes the
 * whole remaining item as one asset: that is the one case where the new asset
 * is the same physical item (e.g. the return-to-stock -> deploy round trip);
 * splitting a fungible batch mints fresh lineages via the Prisma default.
 */
export function buildDeployedAssetData(
  stockItem: DeployableStockItem,
  params: {
    locationId: string;
    serialNumber: string | null;
    deployedQuantity: number;
    remainingQuantity: number;
    ownerId: string | null;
    supplierId: string | null;
  }
): Prisma.AssetUncheckedCreateInput {
  const singleUnit = params.deployedQuantity === 1;
  const meta = singleUnit && stockItem.metadata ? parseStockMetadata(stockItem.metadata) : null;
  return {
    locationId: params.locationId,
    ...(singleUnit && params.remainingQuantity === 0 && { lineageId: stockItem.lineageId }),
    typeId: stockItem.typeId,
    manufacturerId: stockItem.manufacturerId,
    modelId: stockItem.modelId,
    serialNumber: params.serialNumber,
    invoiceNumber: stockItem.invoiceNumber,
    invoiceDate: stockItem.invoiceDate,
    ownerId: params.ownerId,
    supplierId: params.supplierId,
    ...(meta && {
      hostname: meta.hostname ?? null,
      warrantyMonths: meta.warrantyMonths ?? null,
      vaultPath: meta.vaultPath ?? null,
    }),
    ...(meta?.macAddresses?.length && {
      macAddresses: { create: meta.macAddresses.map((m) => ({ address: m.address })) },
    }),
    ...(meta?.customFields?.length && {
      customFields: { create: meta.customFields.map((f) => ({ key: f.key, value: f.value })) },
    }),
  };
}
