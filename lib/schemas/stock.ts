import { z } from "zod";
import { MAX_MAC_ADDRESSES, macAddressField } from "@/lib/mac-address";
import { optionalIsoDay } from "@/lib/schemas/dates";
import { hasDeviceIdentity } from "@/lib/schemas/asset";
import { idSchema, MAX_ID_LENGTH } from "@/lib/schemas/ids";

/** Stock item API validation, shared by POST /api/stock and PUT /api/stock/[id]. */

const stockFields = z.object({
  typeId: z.string().min(1, "Type is required").max(MAX_ID_LENGTH),
  manufacturerId: idSchema.optional().nullable(),
  modelId: z.string().min(1, "Model is required").max(MAX_ID_LENGTH),
  serialNumber: z.string().max(100).optional().nullable(),
  quantity: z.number().int().min(1),
  notes: z.string().max(5000).optional().nullable(),
  locationId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  reservedForLocationId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: optionalIsoDay,
  macAddresses: z.array(macAddressField).max(MAX_MAC_ADDRESSES).optional(),
});

export const STOCK_IDENTITY_QUANTITY_MESSAGE = "Quantity must be 1 when a serial number or MAC address is set.";

/** A serial or MAC identifies one physical device: the asset rule (hasDeviceIdentity), stock having no hostname field. */
function requireSingleQuantityForIdentity(
  data: { serialNumber?: string | null; macAddresses?: string[]; quantity?: number },
  ctx: z.RefinementCtx
) {
  const identified = hasDeviceIdentity({ serialNumber: data.serialNumber, macCount: data.macAddresses?.length ?? 0 });
  if (identified && data.quantity !== undefined && data.quantity > 1) {
    ctx.addIssue({ code: "custom", path: ["quantity"], message: STOCK_IDENTITY_QUANTITY_MESSAGE });
  }
}

export const createStockItemSchema = stockFields
  .extend({ quantity: stockFields.shape.quantity.default(1) })
  .superRefine(requireSingleQuantityForIdentity);

export const updateStockItemSchema = stockFields.partial().superRefine(requireSingleQuantityForIdentity);
