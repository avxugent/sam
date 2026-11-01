import { z } from "zod";
import { Criticality } from "@/generated/prisma/enums";
import { MAX_MAC_ADDRESSES, macAddressField } from "@/lib/mac-address";
import { optionalIsoDay } from "@/lib/schemas/dates";
import { MAX_ID_LENGTH } from "@/lib/schemas/ids";

/**
 * Asset API validation, shared by the create route (POST /api/locations/[id]/assets)
 * and the update route (PUT /api/assets/[id]). The asset form mirrors these rules
 * with translated messages in components/assets/asset-form-dialog.tsx.
 */

export const MAX_CUSTOM_FIELDS = 50;

const customFieldSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
});

const assetFields = z.object({
  typeId: z.string().min(1, "Type is required").max(MAX_ID_LENGTH),
  manufacturerId: z.string().min(1, "Manufacturer is required").max(MAX_ID_LENGTH),
  modelId: z.string().min(1, "Model is required").max(MAX_ID_LENGTH),
  serialNumber: z.string().max(100).optional().nullable(),
  // Stored trimmed; a blank hostname is no hostname.
  hostname: z.string().trim().max(255).transform((v) => v || null).optional().nullable(),
  quantity: z.number().int().min(1).max(9999),
  installationDate: optionalIsoDay,
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: optionalIsoDay,
  notes: z.string().max(5000).optional().nullable(),
  vaultPath: z.string().max(500).optional().nullable(),
  ownerId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  criticality: z.enum(Criticality).optional().nullable(),
  endOfSupportDate: optionalIsoDay,
  supplierId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  macAddresses: z.array(macAddressField).max(MAX_MAC_ADDRESSES).optional(),
  customFields: z.array(customFieldSchema).max(MAX_CUSTOM_FIELDS).optional(),
});

type IdentityFields = {
  hostname?: string | null;
  serialNumber?: string | null;
  macAddresses?: string[];
  quantity?: number;
};

/**
 * A serial, hostname or MAC identifies one physical device, so such an asset
 * has quantity 1. Shared by these schemas, the asset update route (which
 * checks the merged before/after values) and the CSV import.
 */
export function hasDeviceIdentity(asset: { serialNumber?: string | null; hostname?: string | null; macCount: number }): boolean {
  return !!asset.serialNumber?.trim() || !!asset.hostname?.trim() || asset.macCount > 0;
}

export const IDENTITY_QUANTITY_MESSAGE = "Quantity must be 1 when a serial number, hostname, or MAC address is set.";

/** A hostname is only meaningful (DHCP, monitoring) with at least one MAC. */
function requireMacForHostname(data: IdentityFields, ctx: z.RefinementCtx) {
  if (data.hostname && !data.macAddresses?.length) {
    ctx.addIssue({
      code: "custom",
      path: ["macAddresses"],
      message: "At least one MAC address is required when hostname is set.",
    });
  }
}

function requireSingleQuantityForIdentity(data: IdentityFields, ctx: z.RefinementCtx) {
  if (hasDeviceIdentity({ ...data, macCount: data.macAddresses?.length ?? 0 }) && data.quantity !== 1) {
    ctx.addIssue({ code: "custom", path: ["quantity"], message: IDENTITY_QUANTITY_MESSAGE });
  }
}

export const createAssetSchema = assetFields
  .extend({ quantity: assetFields.shape.quantity.default(1) })
  .superRefine((data, ctx) => {
    requireMacForHostname(data, ctx);
    requireSingleQuantityForIdentity(data, ctx);
  });

export const updateAssetSchema = assetFields
  .partial()
  .extend({ locationId: z.string().max(MAX_ID_LENGTH).optional() })
  .superRefine(requireMacForHostname);
