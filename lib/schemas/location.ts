import { z } from "zod";

/** FI number: CC.BB.FFF.RR(R), e.g. 14.10.100.13 or 14.10.100.013 — the room segment may be 2 or 3 digits. */
export const FI_NUMBER_REGEX = /^\d{2}\.\d{2}\.\d{3}\.\d{2,3}$/;

const locationFields = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  parentId: z.string().nullable().optional(),
  fiNumber: z
    .string()
    .max(20)
    .regex(FI_NUMBER_REGEX, "FI number must be in format CC.BB.FFF.RRR (e.g. 14.10.100.013)")
    .optional()
    .nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
});

export const createLocationSchema = locationFields;

export const updateLocationSchema = locationFields.partial().extend({
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  coverImageId: z.string().optional().nullable(),
  inMaintenance: z.boolean().optional(),
});
