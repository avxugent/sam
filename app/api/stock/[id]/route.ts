import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { parseStockMetadata, serializeStockMetadata } from "@/lib/stock-metadata";
import { updateStockItemSchema } from "@/lib/schemas/stock";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: {
      id: true,
      typeId: true,
      manufacturerId: true,
      modelId: true,
      model: { select: { name: true } },
      serialNumber: true,
      quantity: true,
      notes: true,
      locationId: true,
      invoiceNumber: true,
      invoiceDate: true,
      location: { select: { id: true, name: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.stockItem.findUnique({ where: { id }, include: { model: { select: { name: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await readJsonBody(req);
  const parsed = updateStockItemSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { invoiceDate, macAddresses, ...rest } = parsed.data;

  // Replace the MAC list in the metadata blob, preserving any other keys (hostname,
  // customFields, …) that may have been stored when the item came from an asset.
  let metadataUpdate: { metadata: string | null } | Record<string, never> = {};
  if (macAddresses !== undefined) {
    const meta = parseStockMetadata(existing.metadata);
    metadataUpdate = {
      metadata: serializeStockMetadata({ ...meta, macAddresses: macAddresses.map((address) => ({ address })) }),
    };
  }

  const item = await prisma.stockItem.update({
    where: { id },
    data: {
      ...rest,
      ...(invoiceDate !== undefined
        ? { invoiceDate: invoiceDate ? new Date(invoiceDate) : null }
        : {}),
      ...metadataUpdate,
    },
    include: { type: true, manufacturer: true, model: true, location: { select: { id: true, name: true } } },
  });

  const d = parsed.data;
  const changes = auditChanges([
    d.modelId !== undefined && { label: "Model", before: existing.modelId, after: d.modelId, display: [existing.model?.name, item.model?.name] },
    d.serialNumber !== undefined && { label: "Serial number", before: existing.serialNumber, after: d.serialNumber },
    d.quantity !== undefined && { label: "Quantity", before: existing.quantity, after: d.quantity },
    d.notes !== undefined && { label: "Notes", before: existing.notes, after: d.notes },
    d.invoiceNumber !== undefined && { label: "Invoice number", before: existing.invoiceNumber, after: d.invoiceNumber },
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "StockItem",
    entityId: id,
    entityName: item.model?.name,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
    lineageId: item.lineageId,
  });

  return NextResponse.json(item);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: { model: { select: { name: true } }, lineageId: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.stockItem.delete({ where: { id } });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "StockItem",
    entityId: id,
    entityName: item.model?.name,
    lineageId: item.lineageId,
  });

  return NextResponse.json({ ok: true });
}
