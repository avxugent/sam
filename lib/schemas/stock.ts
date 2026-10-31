import { z } from "zod";
import { MAX_MAC_ADDRESSES, macAddressField } from "@/lib/mac-address";
import { optionalIsoDay } from "@/lib/schemas/dates";

/** Stock item API validation, shared by POST /api/stock and PUT /api/stock/[id]. */

const stockFields = z.object({
  typeId: z.string().min(1, "Type is required"),
  manufacturerId: z.string().min(1).optional().nullable(),
  modelId: z.string().min(1, "Model is required"),
  serialNumber: z.string().max(100).optional().nullable(),
  quantity: z.number().int().min(1),
  notes: z.string().max(5000).optional().nullable(),
  locationId: z.string().optional().nullable(),
  reservedForLocationId: z.string().optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: optionalIsoDay,
  macAddresses: z.array(macAddressField).max(MAX_MAC_ADDRESSES).optional(),
});

/** A serialized item is one physical unit. */
function requireSingleQuantityForSerial(data: { serialNumber?: string | null; quantity?: number }, ctx: z.RefinementCtx) {
  if (data.serialNumber && data.quantity !== undefined && data.quantity > 1) {
    ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be 1 when a serial number is set." });
  }
}

export const createStockItemSchema = stockFields
  .extend({ quantity: stockFields.shape.quantity.default(1) })
  .superRefine(requireSingleQuantityForSerial);

export const updateStockItemSchema = stockFields.partial().superRefine(requireSingleQuantityForSerial);
