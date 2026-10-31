import { z } from "zod";

/** A calendar day as date inputs send it: YYYY-MM-DD, and a day that exists. */
export const isoDay = z.iso.date("Date must be YYYY-MM-DD");

/** An optional day field of a form: a day, or "" / null to clear it. */
export const optionalIsoDay = z.union([isoDay, z.literal("")]).optional().nullable();
