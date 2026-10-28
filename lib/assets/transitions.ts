import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { DisposalMethod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  buildDecommissionUpdateData,
  buildStockItemFromReturn,
  type LifecycleViolation,
} from "@/lib/assets/lifecycle-rules";

/**
 * Persisting half of the asset state transitions (decommission, return to
 * stock) shared by the single-asset and bulk routes: what to load, how to
 * validate the request, and the write + audit trail, built on the pure rules
 * in lib/assets/lifecycle-rules.ts. Routes keep their own auth checks and
 * decide how a rule violation is reported (400 vs. a per-id failure entry).
 */

/** A lifecycle violation as the 400 a single-asset route sends back. */
export function lifecycleViolationResponse(violation: LifecycleViolation | null): NextResponse | null {
  return violation && NextResponse.json({ error: violation.message }, { status: 400 });
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
    const item = await tx.stockItem.create({ data: buildStockItemFromReturn(asset, locationId) });
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
