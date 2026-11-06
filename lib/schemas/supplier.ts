import { z } from "zod";
import { isoDay } from "@/lib/schemas/dates";

/** Shared between the supplier API routes and the admin client. */
export const supplierSchema = z
  .object({
    name: z.string().min(1).max(255),
    contractReference: z.string().max(255).optional().nullable(),
    contactInfo: z.string().max(2000).optional().nullable(),
    defaultFrom: isoDay.optional().nullable(),
    defaultUntil: isoDay.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.defaultUntil && !data.defaultFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultUntil"],
        message: "defaultUntil requires defaultFrom",
      });
    }
    if (data.defaultFrom && data.defaultUntil && data.defaultUntil < data.defaultFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultUntil"],
        message: "defaultUntil must be on or after defaultFrom",
      });
    }
  });
