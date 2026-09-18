import type { DisposalMethod, Prisma } from "@/generated/prisma/client";

/**
 * Business-rule checks shared by the single-asset and bulk decommission /
 * return-to-stock routes, so both enforce identical validation.
 */
export type AssetLifecycleErrorCode =
  | "ALREADY_DECOMMISSIONED"
  | "MISSING_TYPE"
  | "MISSING_MODEL";

export class AssetLifecycleError extends Error {
  code: AssetLifecycleErrorCode;

  constructor(code: AssetLifecycleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function assertDecommissionable(asset: { status: string }): void {
  if (asset.status === "DECOMMISSIONED") {
    throw new AssetLifecycleError("ALREADY_DECOMMISSIONED", "Asset is already decommissioned.");
  }
}

export function assertReturnableToStock(asset: {
  status: string;
  typeId: string | null;
  model: string | null;
}): void {
  if (asset.status === "DECOMMISSIONED") {
    throw new AssetLifecycleError(
      "ALREADY_DECOMMISSIONED",
      "Decommissioned assets cannot be returned to stock."
    );
  }
  if (!asset.typeId) {
    throw new AssetLifecycleError("MISSING_TYPE", "Asset must have a type to be returned to stock.");
  }
  if (!asset.model) {
    throw new AssetLifecycleError("MISSING_MODEL", "Asset must have a model to be returned to stock.");
  }
}

type ReturnableAsset = {
  typeId: string | null;
  manufacturerId: string | null;
  model: string | null;
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
export function buildReturnToStockStockItemData(
  asset: ReturnableAsset
): Prisma.StockItemUncheckedCreateInput {
  const metadata: Record<string, unknown> = {};
  if (asset.macAddresses.length > 0) metadata.macAddresses = asset.macAddresses;
  if (asset.customFields.length > 0) metadata.customFields = asset.customFields;
  if (asset.hostname) metadata.hostname = asset.hostname;
  if (asset.warrantyMonths != null) metadata.warrantyMonths = asset.warrantyMonths;
  if (asset.vaultPath) metadata.vaultPath = asset.vaultPath;

  return {
    typeId: asset.typeId!,
    manufacturerId: asset.manufacturerId,
    model: asset.model!,
    serialNumber: asset.serialNumber,
    invoiceNumber: asset.invoiceNumber,
    invoiceDate: asset.invoiceDate,
    notes: asset.notes,
    quantity: 1,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
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
  };
}
