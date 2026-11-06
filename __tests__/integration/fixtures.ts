/**
 * Shared setup for the *.int.test.ts files: a unique name prefix per test
 * file, a fake session for that run, and a cleanup that removes every row the
 * run created (matched by the prefix, or by the fake user id for audit rows),
 * so it can run in afterAll even when a test failed half-way.
 */
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/enums";
import type { prisma as Prisma } from "@/lib/prisma";

type Db = typeof Prisma;

export function newTag(name: string) {
  return `it-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const threeDigits = () => String(Math.floor(Math.random() * 1000)).padStart(3, "0");

/**
 * A FI number (CC.BB.FFF.RRR) under a test-only campus.building prefix, with a
 * random floor and room: fiNumber is @unique, so a row leaked by an aborted
 * run must not make a later run collide.
 */
export function testFiNumber(campusBuilding: string) {
  return `${campusBuilding}.${threeDigits()}.${threeDigits()}`;
}

/** The session the code under test acts as; its user id marks the audit rows to clean up. */
export function testSession(tag: string, role: Role): Session {
  return {
    user: { id: `${tag}-user`, email: `${tag}@example.invalid`, name: tag, role },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as Session;
}

/** Deletes everything named with `tag` (and the audit rows of its session). */
export async function cleanup(prisma: Db, tag: string) {
  const named = { startsWith: tag };
  const ours = {
    OR: [
      { location: { name: named } },
      { type: { name: named } },
      { manufacturer: { name: named } },
      { model: { name: named } },
    ],
  };
  await prisma.asset.deleteMany({ where: ours });
  await prisma.stockItem.deleteMany({ where: ours });
  await prisma.model.deleteMany({ where: { OR: [{ name: named }, { type: { name: named } }, { manufacturer: { name: named } }] } });
  // Templates and maintenance presets cascade with their type/manufacturer.
  await prisma.assetType.deleteMany({ where: { name: named } });
  await prisma.manufacturer.deleteMany({ where: { name: named } });
  // parentId is ON DELETE RESTRICT: remove leaves until the tree is gone.
  for (let i = 0; i < 20; i++) {
    const { count } = await prisma.location.deleteMany({ where: { name: named, children: { none: {} } } });
    if (count === 0) break;
  }
  await prisma.auditLog.deleteMany({ where: { userId: `${tag}-user` } });
}

/** How many rows with `tag` are left anywhere (0 after cleanup). */
export async function leftovers(prisma: Db, tag: string) {
  const named = { startsWith: tag };
  const counts = await Promise.all([
    prisma.location.count({ where: { name: named } }),
    prisma.assetType.count({ where: { name: named } }),
    prisma.manufacturer.count({ where: { name: named } }),
    prisma.model.count({ where: { name: named } }),
    prisma.auditLog.count({ where: { userId: `${tag}-user` } }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}
