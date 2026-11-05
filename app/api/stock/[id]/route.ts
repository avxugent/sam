import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isForeignKeyError, isRecordNotFoundError, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { parseStockMetadata, serializeStockMetadata, stockMetadataMacs } from "@/lib/stock-metadata";
import { STOCK_IDENTITY_QUANTITY_MESSAGE, updateStockItemSchema } from "@/lib/schemas/stock";
import { hasDeviceIdentity } from "@/lib/schemas/asset";
import { toDateUpdate, toIsoDay } from "@/lib/dates";
import { STOCK_ITEM_ROW_INCLUDE } from "@/lib/assets/include";
import { HISTORY_CHANGE_LABELS } from "@/lib/assets/history-keys";

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
  if (!item) return notFoundResponse("Stock item");

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
  const existing = await prisma.stockItem.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      model: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!existing) return notFoundResponse("Stock item");

  const body = await readJsonBody(req);
  const parsed = updateStockItemSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { invoiceDate, macAddresses, ...rest } = parsed.data;

  const meta = parseStockMetadata(existing.metadata);
  const macsBefore = stockMetadataMacs(existing.metadata);

  // The schema only sees the fields in the body; check the single-device rule
  // against the values the item will have, as the asset PUT does.
  const identified = hasDeviceIdentity({
    serialNumber: rest.serialNumber !== undefined ? rest.serialNumber : existing.serialNumber,
    hostname: meta.hostname,
    macCount: macAddresses !== undefined ? macAddresses.length : macsBefore.length,
  });
  if (identified && (rest.quantity ?? existing.quantity) > 1) {
    return NextResponse.json({ error: STOCK_IDENTITY_QUANTITY_MESSAGE }, { status: 400 });
  }

  let item;
  try {
    item = await prisma.stockItem.update({
      where: { id },
      data: {
        ...rest,
        invoiceDate: toDateUpdate(invoiceDate),
        // Replace the MAC list in the metadata blob, preserving any other keys (hostname,
        // customFields, …) that may have been stored when the item came from an asset.
        ...(macAddresses !== undefined && {
          metadata: serializeStockMetadata({ ...meta, macAddresses: macAddresses.map((address) => ({ address })) }),
        }),
      },
      include: STOCK_ITEM_ROW_INCLUDE,
    });
  } catch (err) {
    if (isForeignKeyError(err)) return unknownReferenceResponse();
    // Deleted (or deployed) by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Stock item");
    throw err;
  }

  const d = parsed.data;
  const sortedMacs = (list: string[]) => [...list].sort().join(", ") || null;
  const changes = auditChanges([
    d.typeId !== undefined && { label: "Type", before: existing.typeId, after: d.typeId, display: [existing.type.name, item.type.name] },
    d.manufacturerId !== undefined && { label: "Manufacturer", before: existing.manufacturerId, after: d.manufacturerId, display: [existing.manufacturer?.name, item.manufacturer?.name] },
    d.modelId !== undefined && { label: "Model", before: existing.modelId, after: d.modelId, display: [existing.model?.name, item.model?.name] },
    d.serialNumber !== undefined && { label: "Serial number", before: existing.serialNumber, after: d.serialNumber },
    d.quantity !== undefined && { label: "Quantity", before: existing.quantity, after: d.quantity },
    d.notes !== undefined && { label: "Notes", before: existing.notes, after: d.notes },
    d.locationId !== undefined && { label: HISTORY_CHANGE_LABELS.location, before: existing.locationId, after: d.locationId, display: [existing.location?.name, item.location?.name] },
    d.reservedForLocationId !== undefined && { label: "Reserved for", before: existing.reservedForLocationId, after: d.reservedForLocationId },
    d.invoiceNumber !== undefined && { label: "Invoice number", before: existing.invoiceNumber, after: d.invoiceNumber },
    invoiceDate !== undefined && { label: "Invoice date", before: toIsoDay(existing.invoiceDate), after: invoiceDate || null },
    macAddresses !== undefined && { label: "MAC addresses", before: sortedMacs(macsBefore), after: sortedMacs(macAddresses) },
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
  if (!item) return notFoundResponse("Stock item");

  try {
    await prisma.stockItem.delete({ where: { id } });
  } catch (err) {
    // Deleted (or deployed) by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Stock item");
    throw err;
  }

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
