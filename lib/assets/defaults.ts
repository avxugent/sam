import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { findCurrentDefaultSupplier } from "@/lib/suppliers/window";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Resolves the owner and supplier defaults applied when an asset is created.
 *
 * - ownerId undefined → falls back to the "assets.defaultOwnerId" AppSetting
 *   (verified to still reference an existing user); explicit null stays null.
 * - supplierId undefined → falls back to the supplier whose default window
 *   contains today; explicit null stays null.
 *
 * Accepts the db handle so $transaction callers (stock deploy) can pass tx.
 */
export async function resolveAssetCreationDefaults(
  db: Db,
  provided: { ownerId?: string | null; supplierId?: string | null },
  today: Date = new Date()
): Promise<{ ownerId: string | null; supplierId: string | null }> {
  let ownerId = provided.ownerId ?? null;
  let supplierId = provided.supplierId ?? null;

  if (provided.ownerId === undefined) {
    const setting = await db.appSetting.findUnique({
      where: { key: "assets.defaultOwnerId" },
      select: { value: true },
    });
    if (setting?.value) {
      const user = await db.user.findUnique({
        where: { id: setting.value },
        select: { id: true },
      });
      ownerId = user?.id ?? null;
    }
  }

  if (provided.supplierId === undefined) {
    const suppliers = await db.supplier.findMany({
      where: { defaultFrom: { not: null } },
      select: { id: true, defaultFrom: true, defaultUntil: true },
    });
    supplierId = findCurrentDefaultSupplier(suppliers, today)?.id ?? null;
  }

  return { ownerId, supplierId };
}
