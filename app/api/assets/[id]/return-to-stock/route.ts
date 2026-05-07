import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      location: { select: { name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (asset.status === "DECOMMISSIONED") {
    return NextResponse.json({ error: "Decommissioned assets cannot be returned to stock." }, { status: 400 });
  }
  if (!asset.typeId) {
    return NextResponse.json({ error: "Asset must have a type to be returned to stock." }, { status: 400 });
  }
  if (!asset.model) {
    return NextResponse.json({ error: "Asset must have a model to be returned to stock." }, { status: 400 });
  }

  const metadata: Record<string, unknown> = {};
  if (asset.macAddresses.length > 0) metadata.macAddresses = asset.macAddresses;
  if (asset.customFields.length > 0) metadata.customFields = asset.customFields;
  if (asset.hostname) metadata.hostname = asset.hostname;
  if (asset.warrantyMonths != null) metadata.warrantyMonths = asset.warrantyMonths;
  if (asset.vaultPath) metadata.vaultPath = asset.vaultPath;

  const stockItem = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const item = await tx.stockItem.create({
      data: {
        typeId: asset.typeId!,
        manufacturerId: asset.manufacturerId,
        model: asset.model!,
        serialNumber: asset.serialNumber,
        invoiceNumber: asset.invoiceNumber,
        invoiceDate: asset.invoiceDate,
        notes: asset.notes,
        quantity: 1,
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      },
    });
    await tx.asset.delete({ where: { id } });
    return item;
  });

  await Promise.all([
    logAudit({
      session,
      req,
      action: "DELETE",
      entityType: "Asset",
      entityId: id,
      entityName: asset.model,
      detail: { snapshot: { "Returned to stock": asset.model, "From location": asset.location.name } },
    }),
    logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "StockItem",
      entityId: stockItem.id,
      entityName: stockItem.model,
      detail: { snapshot: { "Returned from asset at": asset.location.name } },
    }),
  ]);

  return NextResponse.json({ stockItemId: stockItem.id });
}
