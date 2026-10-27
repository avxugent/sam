import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { DisposalMethod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  AssetLifecycleError,
  buildDecommissionUpdateData,
  buildReturnToStockStockItemData,
  type AssetLifecycleErrorCode,
} from "@/lib/asset-lifecycle";

/**
 * Asset state transitions shared by the single-asset and bulk routes
 * (decommission, return to stock): what to load, how to validate the request
 * and the write + audit trail. Routes keep their own auth checks and decide
 * how a rule violation is reported (400 vs. a per-id failure entry).
 */

/** Runs a lifecycle check; a violation becomes a 400 with its message. */
export function lifecycleViolationResponse(check: () => void): NextResponse | null {
  return withLifecycleError(check, (err) => NextResponse.json({ error: err.message }, { status: 400 }));
}

/** Runs a lifecycle check; a violation becomes its code, for bulk `failed` entries. */
export function lifecycleViolationCode(check: () => void): AssetLifecycleErrorCode | null {
  return withLifecycleError(check, (err) => err.code);
}

function withLifecycleError<T>(check: () => void, onViolation: (err: AssetLifecycleError) => T): T | null {
  try {
    check();
    return null;
  } catch (err) {
    if (err instanceof AssetLifecycleError) return onViolation(err);
    throw err;
  }
}

// ── Decommission ─────────────────────────────────────────────────────────────

export const decommissionFields = {
  note: z.string().max(500).optional().nullable(),
  // Required disposal evidence (NIS2): how the device left the inventory.
  disposalMethod: z.enum(DisposalMethod),
};

export const DECOMMISSION_SELECT = {
  model: { select: { name: true } },
  status: true,
  lineageId: true,
  location: { select: { name: true, fiNumber: true } },
} satisfies Prisma.AssetSelect;

type DecommissionCandidate = Prisma.AssetGetPayload<{ select: typeof DECOMMISSION_SELECT }>;

export async function decommissionAsset(
  req: Request,
  session: Session,
  id: string,
  existing: DecommissionCandidate,
  input: { note?: string | null; disposalMethod: DisposalMethod }
) {
  const asset = await prisma.asset.update({
    where: { id },
    data: buildDecommissionUpdateData({
      note: input.note ?? null,
      disposalMethod: input.disposalMethod,
      actorId: session.user.id,
      location: existing.location,
    }),
  });
  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: {
      status: "DECOMMISSIONED",
      note: input.note,
      disposalMethod: input.disposalMethod,
      lastLocation: existing.location.name,
    },
    lineageId: existing.lineageId,
  });
  return asset;
}

// ── Return to stock ──────────────────────────────────────────────────────────

export const RETURN_TO_STOCK_INCLUDE = {
  location: { select: { name: true } },
  model: { select: { name: true } },
  macAddresses: { select: { address: true } },
  customFields: { select: { key: true, value: true } },
} satisfies Prisma.AssetInclude;

type ReturnCandidate = Prisma.AssetGetPayload<{ include: typeof RETURN_TO_STOCK_INCLUDE }>;

/** Replaces the asset by a stock item at `locationId` and audits both sides of the move. */
export async function returnAssetToStock(req: Request, session: Session, asset: ReturnCandidate, locationId: string) {
  const stockItem = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const item = await tx.stockItem.create({ data: buildReturnToStockStockItemData(asset, locationId) });
    await tx.asset.delete({ where: { id: asset.id } });
    return item;
  });

  await Promise.all([
    logAudit({
      session,
      req,
      action: "DELETE",
      entityType: "Asset",
      entityId: asset.id,
      entityName: asset.model?.name ?? undefined,
      detail: { snapshot: { "Returned to stock": asset.model?.name ?? null, "From location": asset.location.name } },
      lineageId: asset.lineageId,
    }),
    logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "StockItem",
      entityId: stockItem.id,
      entityName: asset.model?.name,
      detail: { snapshot: { "Returned from asset at": asset.location.name } },
      lineageId: stockItem.lineageId,
    }),
  ]);
  return stockItem;
}
