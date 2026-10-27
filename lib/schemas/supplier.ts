import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { windowsOverlap } from "@/lib/supplier-window";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Shared between the supplier API routes and the admin client. */
export const supplierSchema = z
  .object({
    name: z.string().min(1).max(255),
    contractReference: z.string().max(255).optional().nullable(),
    contactInfo: z.string().max(2000).optional().nullable(),
    defaultFrom: z.string().regex(dateRe).optional().nullable(),
    defaultUntil: z.string().regex(dateRe).optional().nullable(),
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

/**
 * Names of suppliers whose default windows overlap the candidate window,
 * or null when there is no conflict. `excludeId` skips the supplier being
 * updated.
 */
export async function findConflictingWindows(
  candidate: { defaultFrom: string | null; defaultUntil: string | null },
  excludeId?: string
): Promise<string[] | null> {
  if (!candidate.defaultFrom) return null;
  const others = await prisma.supplier.findMany({
    where: {
      defaultFrom: { not: null },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, defaultFrom: true, defaultUntil: true },
  });
  const conflicting = others.filter((o) => windowsOverlap(o, candidate));
  return conflicting.length > 0 ? conflicting.map((c) => c.name) : null;
}
