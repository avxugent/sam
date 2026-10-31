import { prisma } from "@/lib/prisma";

/**
 * Names of the users behind soft user references (owner, decommissioned by,
 * sent for repair by: plain ids with no foreign key), in one query. A deleted
 * user has no entry; callers choose the fallback.
 */
export async function userNamesById(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
