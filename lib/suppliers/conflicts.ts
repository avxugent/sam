import { prisma } from "@/lib/prisma";
import { windowsOverlap } from "@/lib/suppliers/window";

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
