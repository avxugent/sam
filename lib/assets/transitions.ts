import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { AssetStatus, DisposalMethod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isRecordNotFoundError } from "@/lib/route-helpers";
import { resolveAssetCreationDefaults } from "@/lib/assets/defaults";
import {
  buildDecommissionUpdateData,
  buildDeployedAssetData,
  buildReinstateUpdateData,
  buildSendForRepairUpdateData,
  buildStockItemFromReturn,
  type LifecycleViolation,
  type Returnable,
} from "@/lib/assets/lifecycle-rules";
import type { BulkSkipReason } from "@/lib/assets/bulk";
import { HISTORY_SNAPSHOT_KEYS } from "@/lib/assets/history-keys";

/**
 * Persisting half of the asset state transitions (decommission, repair,
 * reinstate, return to stock, deploy from stock) shared by the single-asset and bulk routes: what
 * to load, how to validate the request, and the write + audit trail, built on
 * the pure rules in lib/assets/lifecycle-rules.ts. Routes keep their own auth
 * checks and decide how a rule violation is reported (400 vs. a per-id
 * failure entry).
 *
 * Each write is guarded by the state the route checked (the asset's status,
 * or for deploy the stock item's quantity), so two concurrent requests cannot
 * both pass the check. A write that lost that race returns null; routes report
 * it with statusChangedResponse(), or stockChangedResponse() for deploy.
 */

/** A lifecycle violation as the 400 a single-asset route sends back. */
export function lifecycleViolationResponse(violation: LifecycleViolation<string>): NextResponse;
export function lifecycleViolationResponse(violation: LifecycleViolation<string> | null): NextResponse | null;
export function lifecycleViolationResponse(violation: LifecycleViolation<string> | null): NextResponse | null {
  return violation && NextResponse.json({ error: violation.message }, { status: 400 });
}

/** Bulk failure reason when another request changed the asset (or stock item) first. */
export const STATUS_CHANGED: BulkSkipReason = "STATUS_CHANGED";

/** The 409 for a stock deploy that lost the race to a concurrent change of the stock item. */
export function stockChangedResponse(): NextResponse {
  return NextResponse.json(
    { error: "The stock item changed in the meantime. Reload and try again.", code: "stockChanged" },
    { status: 409 }
  );
}

/** The 409 for a transition that lost the race to a concurrent change. */
export function statusChangedResponse(): NextResponse {
  return NextResponse.json(
    { error: "The asset's status changed in the meantime. Reload and try again.", code: "statusChanged" },
    { status: 409 }
  );
}

/** Runs a guarded write; null when the guard no longer matched. */
async function unlessChanged<T>(write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (err) {
    if (isRecordNotFoundError(err)) return null;
    throw err;
  }
}

type AuditedAsset = { status: AssetStatus; model: { name: string } | null; lineageId: string };

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
  const asset = await unlessChanged(() =>
    prisma.asset.update({
      where: { id, status: existing.status },
      data: buildDecommissionUpdateData({
        note: input.note ?? null,
        disposalMethod: input.disposalMethod,
        actorId: session.user.id,
        location: existing.location,
      }),
    })
  );
  if (!asset) return null;
  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: {
      status: AssetStatus.DECOMMISSIONED,
      note: input.note,
      disposalMethod: input.disposalMethod,
      lastLocation: existing.location.name,
    },
    lineageId: existing.lineageId,
  });
  return asset;
}

// ── Repair and reinstate ─────────────────────────────────────────────────────

export const REPAIR_SELECT = {
  model: { select: { name: true } },
  status: true,
  lineageId: true,
} satisfies Prisma.AssetSelect;

export async function sendAssetForRepair(
  req: Request,
  session: Session,
  id: string,
  existing: AuditedAsset,
  input: { note?: string | null }
) {
  const note = input.note ?? null;
  const asset = await unlessChanged(() =>
    prisma.asset.update({
      where: { id, status: existing.status },
      data: buildSendForRepairUpdateData({ note, actorId: session.user.id }),
    })
  );
  if (!asset) return null;
  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: { status: AssetStatus.IN_REPAIR, note },
    lineageId: existing.lineageId,
  });
  return asset;
}

export async function reinstateAsset(req: Request, session: Session, id: string, existing: AuditedAsset) {
  const asset = await unlessChanged(() =>
    prisma.asset.update({ where: { id, status: existing.status }, data: buildReinstateUpdateData() })
  );
  if (!asset) return null;
  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: { status: AssetStatus.INSTALLED },
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
export async function returnAssetToStock(req: Request, session: Session, asset: Returnable<ReturnCandidate>, locationId: string) {
  const stockItem = await unlessChanged(() =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const item = await tx.stockItem.create({ data: buildStockItemFromReturn(asset, locationId) });
      await tx.asset.delete({ where: { id: asset.id, status: asset.status } });
      return item;
    })
  );
  if (!stockItem) return null;

  await Promise.all([
    logAudit({
      session,
      req,
      action: "DELETE",
      entityType: "Asset",
      entityId: asset.id,
      entityName: asset.model?.name ?? undefined,
      detail: { snapshot: { [HISTORY_SNAPSHOT_KEYS.returnedToStock]: asset.model?.name ?? null, "From location": asset.location.name } },
      lineageId: asset.lineageId,
    }),
    logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "StockItem",
      entityId: stockItem.id,
      entityName: asset.model?.name,
      detail: { snapshot: { [HISTORY_SNAPSHOT_KEYS.returnedFromAssetAt]: asset.location.name } },
      lineageId: stockItem.lineageId,
    }),
  ]);
  return stockItem;
}

// ── Deploy from stock ────────────────────────────────────────────────────────

export const DEPLOY_INCLUDE = { model: { select: { name: true } } } satisfies Prisma.StockItemInclude;

type DeployCandidate = Prisma.StockItemGetPayload<{ include: typeof DEPLOY_INCLUDE }>;

/**
 * Turns `quantity` units of a stock item into assets at `location` and audits
 * both sides. The stock write only applies while the item still holds the
 * quantity the route checked, so two concurrent deploys cannot both draw the
 * same units; a lost race returns null. A unique-constraint error from the
 * asset create can only be the hostname (the one unique Asset column) and is
 * left to the caller.
 */
export async function deployStockItem(
  req: Request,
  session: Session,
  stockItem: DeployCandidate,
  location: { id: string; name: string },
  input: { quantity: number; serialNumbers?: string[] }
) {
  const { quantity, serialNumbers } = input;
  const remainingQuantity = stockItem.quantity - quantity;
  const createdAssets = await unlessChanged(() =>
    prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Owner/supplier defaults apply to every copy (deploy = creation).
      const defaults = await resolveAssetCreationDefaults(tx, {});
      const guard = { id: stockItem.id, quantity: stockItem.quantity };
      if (remainingQuantity === 0) {
        await tx.stockItem.delete({ where: guard });
      } else {
        await tx.stockItem.update({ where: guard, data: { quantity: remainingQuantity } });
      }
      // One connection per transaction: create the copies one after another.
      const created: { id: string; lineageId: string }[] = [];
      for (let i = 0; i < quantity; i++) {
        created.push(
          await tx.asset.create({
            data: buildDeployedAssetData(stockItem, {
              locationId: location.id,
              serialNumber: stockItem.serialNumber ?? serialNumbers?.[i] ?? null,
              deployedQuantity: quantity,
              remainingQuantity,
              ...defaults,
            }),
            select: { id: true, lineageId: true },
          })
        );
      }
      return created;
    })
  );
  if (!createdAssets) return null;

  await Promise.all(
    createdAssets.map((created) =>
      logAudit({
        session,
        req,
        action: "CREATE",
        entityType: "Asset",
        entityId: created.id,
        entityName: stockItem.model?.name,
        detail: { snapshot: { [HISTORY_SNAPSHOT_KEYS.deployedFromStock]: stockItem.model?.name ?? null, "Location": location.name } },
        lineageId: created.lineageId,
      })
    )
  );
  await logAudit({
    session,
    req,
    action: remainingQuantity === 0 ? "DELETE" : "UPDATE",
    entityType: "StockItem",
    entityId: stockItem.id,
    entityName: stockItem.model?.name,
    detail: { snapshot: { [HISTORY_SNAPSHOT_KEYS.deployedQuantity]: String(quantity), "To location": location.name } },
    lineageId: stockItem.lineageId,
  });
  return createdAssets;
}
