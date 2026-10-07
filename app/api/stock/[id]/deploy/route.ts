import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { resolveAssetCreationDefaults } from "@/lib/asset-defaults";
import type { Prisma } from "@/generated/prisma/client";

const deploySchema = z
  .object({
    locationId: z.string().min(1, "Location is required"),
    quantity: z.number().int().min(1),
    serialNumbers: z.array(z.string().max(100)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumbers !== undefined && data.serialNumbers.length !== data.quantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = deploySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
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

  type StoredMetadata = {
    macAddresses?: { address: string }[];
    customFields?: { key: string; value: string }[];
    hostname?: string;
    warrantyMonths?: number;
    vaultPath?: string;
  };

  let meta: StoredMetadata | null = null;
  if (stockItem.metadata && quantity === 1) {
    try { meta = JSON.parse(stockItem.metadata) as StoredMetadata; } catch { /* ignore */ }
  }

  let createdAssets: { id: string; lineageId: string }[];
  try {
    createdAssets = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Owner/supplier defaults apply to every copy (deploy = creation).
      const defaults = await resolveAssetCreationDefaults(tx, {});
      const newQuantity = stockItem.quantity - quantity;

      if (newQuantity === 0) {
        await tx.stockItem.delete({ where: { id } });
      } else {
        await tx.stockItem.update({ where: { id }, data: { quantity: newQuantity } });
      }

      // A fresh lineage is minted per row via the Prisma default in every
      // case except one: this deploy consumes the stock item's entire
      // remaining quantity as a single asset. That's the only case where the
      // new Asset is genuinely "the same physical item" the StockItem row
      // represented (e.g. the return-to-stock -> deploy round trip for a
      // serialized item); a partial or multi-unit deploy splits a fungible
      // batch into unrelated new units that shouldn't share one lineageId.
      const isFullSingleUnitDeploy = newQuantity === 0 && quantity === 1;

      const assets = await Promise.all(
        Array.from({ length: quantity }, (_, i) =>
          tx.asset.create({
            data: {
              locationId,
              ...(isFullSingleUnitDeploy && { lineageId: stockItem.lineageId }),
              typeId: stockItem.typeId,
              manufacturerId: stockItem.manufacturerId,
              modelId: stockItem.modelId,
              serialNumber:
                stockItem.serialNumber ??
                (serialNumbers ? serialNumbers[i] : null) ??
                null,
              invoiceNumber: stockItem.invoiceNumber,
              invoiceDate: stockItem.invoiceDate,
              ownerId: defaults.ownerId,
              supplierId: defaults.supplierId,
              ...(meta && {
                hostname: meta.hostname ?? null,
                warrantyMonths: meta.warrantyMonths ?? null,
                vaultPath: meta.vaultPath ?? null,
              }),
              ...(meta?.macAddresses?.length && {
                macAddresses: { create: meta.macAddresses.map((m) => ({ address: m.address })) },
              }),
              ...(meta?.customFields?.length && {
                customFields: { create: meta.customFields.map((f) => ({ key: f.key, value: f.value })) },
              }),
            },
            select: { id: true, lineageId: true },
          })
        )
      );

      return assets;
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This hostname is already assigned to another asset." },
        { status: 409 }
      );
    }
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
