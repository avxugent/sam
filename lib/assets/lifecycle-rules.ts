import type { AssetStatus, DisposalMethod, Prisma } from "@/generated/prisma/client";
import { serializeStockMetadata } from "@/lib/stock-metadata";

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
  asset: ReturnableAsset,
  locationId: string
): Prisma.StockItemUncheckedCreateInput {

  return {
    lineageId: asset.lineageId,
    typeId: asset.typeId!,
    manufacturerId: asset.manufacturerId,
    // returnToStockViolation (checked by every caller before this) already
    // reports MISSING_MODEL when null — same guarantee as typeId above.
    modelId: asset.modelId!,
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
