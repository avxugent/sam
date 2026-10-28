import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { customFieldRows, hostnameFormatResponse, hostnameTakenResponse, macAddressRows, unknownSupplierResponse } from "@/lib/assets/input";
import { updateAssetSchema } from "@/lib/schemas/asset";
import { logAudit } from "@/lib/audit";
import { auditChanges, type FieldChange } from "@/lib/audit/diff";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";
import { toIsoDay } from "@/lib/utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      type: true,
      manufacturer: true,
      model: true,
      supplier: true,
      macAddresses: true,
      customFields: true,
      location: { select: { id: true, name: true } },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(asset);
}

/** Prisma value for an optional date field: undefined leaves it, "" or null clears it. */
function toDateUpdate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

/** One diff entry per custom field key that was added, removed or changed. */
function customFieldChanges(before: { key: string; value: string }[], after: { key: string; value: string }[]): FieldChange[] {
  const fromMap = new Map(before.map((f) => [f.key, f.value]));
  const toMap = new Map(after.filter((f) => f.key).map((f) => [f.key, f.value]));
  return [...new Set([...fromMap.keys(), ...toMap.keys()])].map((key) => ({
    label: `Custom field: ${key}`,
    before: fromMap.get(key) ?? null,
    after: toMap.get(key) ?? null,
  }));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { macAddresses, customFields, installationDate, invoiceDate, endOfSupportDate, ...assetData } = parsed.data;

  const supplierError = await unknownSupplierResponse(assetData.supplierId);
  if (supplierError) return supplierError;

  const before = await prisma.asset.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      model: { select: { name: true } },
      supplier: { select: { name: true } },
      location: { select: { name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
    },
  });

  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Values the asset will have after this (possibly partial) update.
  const effective = {
    hostname: (assetData.hostname !== undefined ? assetData.hostname : before.hostname)?.trim() || null,
    serialNumber: (assetData.serialNumber !== undefined ? assetData.serialNumber : before.serialNumber)?.trim() || null,
    typeId: assetData.typeId !== undefined ? assetData.typeId : before.typeId,
    macCount: macAddresses !== undefined ? macAddresses.length : before.macAddresses.length,
    quantity: assetData.quantity !== undefined ? assetData.quantity : before.quantity,
  };

  // Only re-validate hostname format when hostname and/or typeId are part of
  // this update — an unrelated field edit must never fail because a type's
  // pattern was tightened after the asset's hostname was originally set.
  if (assetData.hostname !== undefined || assetData.typeId !== undefined) {
    const hostnameError = await hostnameFormatResponse(effective.hostname, effective.typeId);
    if (hostnameError) return hostnameError;
  }

  // Quantity > 1 only makes sense for bulk items with no individual identity.
  // Checked against the effective values so a partial update that omits
  // identity fields can't sneak past it.
  const touchesIdentity =
    assetData.quantity !== undefined ||
    assetData.serialNumber !== undefined ||
    assetData.hostname !== undefined ||
    macAddresses !== undefined;
  const hasIdentity = !!effective.serialNumber || !!effective.hostname || effective.macCount > 0;
  if (touchesIdentity && hasIdentity && effective.quantity !== 1) {
    return NextResponse.json(
      { error: "Quantity must be 1 when a serial number, hostname, or MAC address is set." },
      { status: 400 }
    );
  }

  let asset;
  try {
    asset = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (macAddresses !== undefined) {
        await tx.macAddress.deleteMany({ where: { assetId: id } });
        if (macAddresses.length > 0) {
          await tx.macAddress.createMany({ data: macAddressRows(macAddresses).map((row) => ({ ...row, assetId: id })) });
        }
      }

      if (customFields !== undefined) {
        await tx.customField.deleteMany({ where: { assetId: id } });
        if (customFields.length > 0) {
          await tx.customField.createMany({ data: customFieldRows(customFields).map((row) => ({ ...row, assetId: id })) });
        }
      }

      return tx.asset.update({
        where: { id },
        data: {
          ...assetData,
          ...(assetData.hostname !== undefined && { hostname: assetData.hostname?.trim() || null }),
          installationDate: toDateUpdate(installationDate),
          invoiceDate: toDateUpdate(invoiceDate),
          endOfSupportDate: toDateUpdate(endOfSupportDate),
        },
        include: {
          type: true,
          manufacturer: true,
          model: true,
          supplier: true,
          macAddresses: true,
          customFields: true,
          location: { select: { id: true, name: true } },
        },
      });
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) return hostnameTakenResponse();
    throw err;
  }

  const d = parsed.data;
  const sortedMacs = (list: string[]) => [...list].sort().join(", ") || null;
  const changes = auditChanges([
    d.modelId !== undefined && { label: "Model", before: before.modelId, after: d.modelId, display: [before.model?.name, asset.model?.name] },
    d.quantity !== undefined && { label: "Quantity", before: before.quantity, after: d.quantity },
    d.serialNumber !== undefined && { label: "Serial number", before: before.serialNumber, after: d.serialNumber },
    d.hostname !== undefined && { label: "Hostname", before: before.hostname, after: d.hostname?.trim() || null },
    d.invoiceNumber !== undefined && { label: "Invoice number", before: before.invoiceNumber, after: d.invoiceNumber },
    d.notes !== undefined && { label: "Notes", before: before.notes, after: d.notes },
    d.vaultPath !== undefined && { label: "Vault path", before: before.vaultPath, after: d.vaultPath },
    d.typeId !== undefined && { label: "Type", before: before.typeId, after: d.typeId, display: [before.type?.name ?? before.typeId, asset.type?.name ?? d.typeId] },
    d.manufacturerId !== undefined && { label: "Manufacturer", before: before.manufacturerId, after: d.manufacturerId, display: [before.manufacturer?.name ?? before.manufacturerId, asset.manufacturer?.name ?? d.manufacturerId] },
    d.locationId !== undefined && { label: "Location", before: before.locationId, after: d.locationId, display: [before.location?.name, asset.location?.name] },
    d.ownerId !== undefined && { label: "Owner", before: before.ownerId, after: d.ownerId },
    d.criticality !== undefined && { label: "Criticality", before: before.criticality, after: d.criticality },
    d.supplierId !== undefined && { label: "Supplier", before: before.supplierId, after: d.supplierId, display: [before.supplier?.name ?? before.supplierId, asset.supplier?.name ?? d.supplierId] },
    endOfSupportDate !== undefined && { label: "End of support", before: toIsoDay(before.endOfSupportDate), after: endOfSupportDate || null },
    installationDate !== undefined && { label: "Installation date", before: toIsoDay(before.installationDate), after: installationDate || null },
    invoiceDate !== undefined && { label: "Invoice date", before: toIsoDay(before.invoiceDate), after: invoiceDate || null },
    macAddresses !== undefined && { label: "MAC addresses", before: sortedMacs(before.macAddresses.map((m) => m.address)), after: sortedMacs(macAddresses) },
    ...(customFields !== undefined ? customFieldChanges(before.customFields, customFields) : []),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: asset.model?.name ?? asset.serialNumber ?? undefined,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
    lineageId: asset.lineageId,
  });

  return NextResponse.json(asset);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      model: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.asset.delete({ where: { id } });

  const snapshot: Record<string, string> = {};
  if (asset.model?.name) snapshot["Model"] = asset.model.name;
  if (asset.serialNumber) snapshot["Serial number"] = asset.serialNumber;
  if (asset.type?.name) snapshot["Type"] = asset.type.name;
  if (asset.manufacturer?.name) snapshot["Manufacturer"] = asset.manufacturer.name;
  if (asset.location?.name) snapshot["Location"] = asset.location.name;
  if (asset.hostname) snapshot["Hostname"] = asset.hostname;

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Asset",
    entityId: id,
    entityName: asset.model?.name ?? asset.serialNumber ?? undefined,
    detail: Object.keys(snapshot).length > 0 ? { snapshot } : undefined,
    lineageId: asset.lineageId,
  });
  return NextResponse.json({ ok: true });
}
