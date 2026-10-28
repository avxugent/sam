import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { resolveAssetCreationDefaults } from "@/lib/assets/defaults";
import type { Prisma } from "@/generated/prisma/client";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";
import { buildDeployedAssetData } from "@/lib/assets/lifecycle-rules";
import { hostnameTakenResponse } from "@/lib/assets/write";

const deploySchema = z
  .object({
    locationId: z.string().min(1, "Location is required"),
    quantity: z.number().int().min(1),
    serialNumbers: z.array(z.string().max(100)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumbers !== undefined && data.serialNumbers.length !== data.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["serialNumbers"],
        message: "serialNumbers length must equal quantity.",
      });
    }
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = deploySchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { locationId, quantity, serialNumbers } = parsed.data;

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const stockItem = await prisma.stockItem.findUnique({
    where: { id },
    include: { model: { select: { name: true } } },
  });
  if (!stockItem) return NextResponse.json({ error: "Stock item not found" }, { status: 404 });

  if (quantity > stockItem.quantity) {
    return NextResponse.json(
      { error: `Only ${stockItem.quantity} unit(s) available.` },
      { status: 400 }
    );
  }

  // Serialized item: the stockItem itself has a serial — quantity must be 1
  if (stockItem.serialNumber && quantity !== 1) {
    return NextResponse.json(
      { error: "Serialized stock items can only be deployed one at a time." },
      { status: 400 }
    );
  }

  let createdAssets: { id: string; lineageId: string }[];
  try {
    createdAssets = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Owner/supplier defaults apply to every copy (deploy = creation).
      const defaults = await resolveAssetCreationDefaults(tx, {});
      const remainingQuantity = stockItem.quantity - quantity;

      if (remainingQuantity === 0) {
        await tx.stockItem.delete({ where: { id } });
      } else {
        await tx.stockItem.update({ where: { id }, data: { quantity: remainingQuantity } });
      }

      return Promise.all(
        Array.from({ length: quantity }, (_, i) =>
          tx.asset.create({
            data: buildDeployedAssetData(stockItem, {
              locationId,
              serialNumber: stockItem.serialNumber ?? serialNumbers?.[i] ?? null,
              deployedQuantity: quantity,
              remainingQuantity,
              ...defaults,
            }),
            select: { id: true, lineageId: true },
          })
        )
      );
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) return hostnameTakenResponse();
    throw err;
  }

  // Audit each created asset + the stock item mutation
  await Promise.all(
    createdAssets.map((created) =>
      logAudit({
        session,
        req,
        action: "CREATE",
        entityType: "Asset",
        entityId: created.id,
        entityName: stockItem.model?.name,
        detail: { snapshot: { "Deployed from stock": stockItem.model?.name ?? null, "Location": location.name } },
        lineageId: created.lineageId,
      })
    )
  );
  await logAudit({
    session,
    req,
    action: stockItem.quantity - quantity === 0 ? "DELETE" : "UPDATE",
    entityType: "StockItem",
    entityId: id,
    entityName: stockItem.model?.name,
    detail: { snapshot: { "Deployed quantity": String(quantity), "To location": location.name } },
    lineageId: stockItem.lineageId,
  });

  return NextResponse.json({ assetIds: createdAssets.map((a) => a.id), locationId });
}
