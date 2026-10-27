import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { matchesHostnamePattern } from "@/lib/hostname-pattern";
import { normalizeMacAddress } from "@/lib/mac-address";
import { logAudit } from "@/lib/audit";
import { CRITICALITY_VALUES } from "@/lib/criticality";
import { canEdit } from "@/lib/permissions";

const MAX_CUSTOM_FIELDS = 50;
const MAX_MAC_ADDRESSES = 20;

const FQDN_REGEX =
  /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// Accepts any recoverable MAC shape (colon, hyphen, dot-grouped, no
// separator, mixed case) and normalizes it to AA:BB:CC:DD:EE:FF — mirrors
// the CSV import behavior so manually edited assets can't reintroduce
// inconsistent formats.
const macAddressField = z.string().transform((v, ctx) => {
  const normalized = normalizeMacAddress(v);
  if (normalized === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid MAC address format (expected AA:BB:CC:DD:EE:FF)",
    });
    return z.NEVER;
  }
  return normalized;
});

const customFieldSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
});

const updateSchema = z
  .object({
    locationId: z.string().optional(),
    typeId: z.string().min(1, "Type is required").optional(),
    manufacturerId: z.string().min(1, "Manufacturer is required").optional(),
    modelId: z.string().min(1, "Model is required").optional(),
    serialNumber: z.string().max(100).optional().nullable(),
    hostname: z.string().max(255).optional().nullable(),
    quantity: z.number().int().min(1).max(9999).optional(),
    installationDate: z.string().optional().nullable(),
    invoiceNumber: z.string().max(100).optional().nullable(),
    invoiceDate: z.string().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    vaultPath: z.string().max(500).optional().nullable(),
    ownerId: z.string().max(64).optional().nullable(),
    criticality: z.enum(CRITICALITY_VALUES).optional().nullable(),
    endOfSupportDate: z.string().optional().nullable(),
    supplierId: z.string().max(64).optional().nullable(),
    macAddresses: z.array(macAddressField).max(MAX_MAC_ADDRESSES).optional(),
    customFields: z.array(customFieldSchema).max(MAX_CUSTOM_FIELDS).optional(),
  })
  .superRefine((data, ctx) => {
    const hostnameSet = !!data.hostname?.trim();
    const hasValidMac = (data.macAddresses ?? []).length > 0;
    if (hostnameSet && !hasValidMac) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["macAddresses"],
        message: "At least one MAC address is required when hostname is set.",
      });
    }
  });

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { macAddresses, customFields, installationDate, invoiceDate, endOfSupportDate, ...assetData } = parsed.data;

  if (assetData.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: assetData.supplierId }, select: { id: true } });
    if (!supplier) {
      return NextResponse.json({ error: "Unknown supplier." }, { status: 400 });
    }
  }

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

  // Only re-validate hostname format when hostname and/or typeId are part of
  // this update — an unrelated field edit must never fail because a type's
  // pattern was tightened after the asset's hostname was originally set.
  if (assetData.hostname !== undefined || assetData.typeId !== undefined) {
    const effectiveHostname = (
      assetData.hostname !== undefined ? assetData.hostname : before?.hostname
    )?.trim();
    if (effectiveHostname) {
      const effectiveTypeId = assetData.typeId !== undefined ? assetData.typeId : before?.typeId;
      const assetType = effectiveTypeId
        ? await prisma.assetType.findUnique({ where: { id: effectiveTypeId }, select: { hostnamePattern: true } })
        : null;
      const isValidHostname = assetType?.hostnamePattern
        ? matchesHostnamePattern(effectiveHostname, assetType.hostnamePattern)
        : FQDN_REGEX.test(effectiveHostname);
      if (!isValidHostname) {
        return NextResponse.json(
          { error: "Hostname does not match the required format for this asset type." },
          { status: 400 }
        );
      }
    }
  }

  // Quantity > 1 only makes sense for bulk items with no individual identity.
  // Re-derive the effective serial/hostname/MAC/quantity against `before` so a
  // partial update that omits identity fields can't sneak past the check.
  if (
    assetData.quantity !== undefined ||
    assetData.serialNumber !== undefined ||
    assetData.hostname !== undefined ||
    macAddresses !== undefined
  ) {
    const effectiveSerial = (
      assetData.serialNumber !== undefined ? assetData.serialNumber : before?.serialNumber
    )?.trim();
    const effectiveHostname = (
      assetData.hostname !== undefined ? assetData.hostname : before?.hostname
    )?.trim();
    const effectiveMacCount = macAddresses !== undefined ? macAddresses.length : (before?.macAddresses.length ?? 0);
    const effectiveQuantity = assetData.quantity !== undefined ? assetData.quantity : (before?.quantity ?? 1);
    const hasIdentity = !!effectiveSerial || !!effectiveHostname || effectiveMacCount > 0;
    if (hasIdentity && effectiveQuantity !== 1) {
      return NextResponse.json(
        { error: "Quantity must be 1 when a serial number, hostname, or MAC address is set." },
        { status: 400 }
      );
    }
  }

  let asset;
  try {
    asset = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (macAddresses !== undefined) {
        await tx.macAddress.deleteMany({ where: { assetId: id } });
        if (macAddresses.length > 0) {
          await tx.macAddress.createMany({
            data: macAddresses.filter(Boolean).map((address) => ({ assetId: id, address })),
          });
        }
      }

      if (customFields !== undefined) {
        await tx.customField.deleteMany({ where: { assetId: id } });
        if (customFields.length > 0) {
          await tx.customField.createMany({
            data: customFields.filter((f) => f.key).map((f) => ({ assetId: id, key: f.key, value: f.value })),
          });
        }
      }

      return tx.asset.update({
        where: { id },
        data: {
          ...assetData,
          ...(assetData.hostname !== undefined && { hostname: assetData.hostname?.trim() || null }),
          installationDate: installationDate !== undefined
            ? installationDate ? new Date(installationDate) : null
            : undefined,
          invoiceDate: invoiceDate !== undefined
            ? invoiceDate ? new Date(invoiceDate) : null
            : undefined,
          endOfSupportDate: endOfSupportDate !== undefined
            ? endOfSupportDate ? new Date(endOfSupportDate) : null
            : undefined,
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
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This hostname is already assigned to another asset." },
        { status: 409 }
      );
    }
    throw err;
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (before) {
    const d = parsed.data;
    if (d.modelId !== undefined && d.modelId !== before.modelId)
      changes["Model"] = { from: before.model?.name ?? null, to: asset.model?.name ?? null };
    if (d.quantity !== undefined && d.quantity !== before.quantity)
      changes["Quantity"] = { from: before.quantity, to: d.quantity };
    if (d.serialNumber !== undefined && d.serialNumber !== before.serialNumber)
      changes["Serial number"] = { from: before.serialNumber ?? null, to: d.serialNumber ?? null };
    if (d.hostname !== undefined && (d.hostname?.trim() ?? null) !== before.hostname)
      changes["Hostname"] = { from: before.hostname ?? null, to: d.hostname ?? null };
    if (d.invoiceNumber !== undefined && d.invoiceNumber !== before.invoiceNumber)
      changes["Invoice number"] = { from: before.invoiceNumber ?? null, to: d.invoiceNumber ?? null };
    if (d.notes !== undefined && d.notes !== before.notes)
      changes["Notes"] = { from: before.notes ?? null, to: d.notes ?? null };
    if (d.vaultPath !== undefined && d.vaultPath !== before.vaultPath)
      changes["Vault path"] = { from: before.vaultPath ?? null, to: d.vaultPath ?? null };
    if (d.typeId !== undefined && d.typeId !== before.typeId)
      changes["Type"] = { from: before.type?.name ?? before.typeId, to: asset.type?.name ?? d.typeId };
    if (d.manufacturerId !== undefined && d.manufacturerId !== before.manufacturerId)
      changes["Manufacturer"] = { from: before.manufacturer?.name ?? before.manufacturerId, to: asset.manufacturer?.name ?? d.manufacturerId };
    if (d.locationId !== undefined && d.locationId !== before.locationId)
      changes["Location"] = { from: before.location?.name ?? null, to: asset.location?.name ?? null };
    if (d.ownerId !== undefined && d.ownerId !== before.ownerId)
      changes["Owner"] = { from: before.ownerId ?? null, to: d.ownerId ?? null };
    if (d.criticality !== undefined && d.criticality !== before.criticality)
      changes["Criticality"] = { from: before.criticality ?? null, to: d.criticality ?? null };
    if (d.supplierId !== undefined && d.supplierId !== before.supplierId)
      changes["Supplier"] = { from: before.supplier?.name ?? before.supplierId ?? null, to: asset.supplier?.name ?? d.supplierId ?? null };
    if (endOfSupportDate !== undefined) {
      const fromDate = before.endOfSupportDate ? before.endOfSupportDate.toISOString().split("T")[0] : null;
      if (fromDate !== endOfSupportDate)
        changes["End of support"] = { from: fromDate, to: endOfSupportDate };
    }
    if (installationDate !== undefined) {
      const fromDate = before.installationDate ? before.installationDate.toISOString().split("T")[0] : null;
      if (fromDate !== installationDate)
        changes["Installation date"] = { from: fromDate, to: installationDate };
    }
    if (invoiceDate !== undefined) {
      const fromDate = before.invoiceDate ? before.invoiceDate.toISOString().split("T")[0] : null;
      if (fromDate !== invoiceDate)
        changes["Invoice date"] = { from: fromDate, to: invoiceDate };
    }
    if (macAddresses !== undefined) {
      const fromMacs = [...before.macAddresses.map((m) => m.address)].sort().join(", ") || null;
      const toMacs = [...macAddresses].sort().join(", ") || null;
      if (fromMacs !== toMacs)
        changes["MAC addresses"] = { from: fromMacs, to: toMacs };
    }
    if (customFields !== undefined) {
      const fromMap = Object.fromEntries(before.customFields.map((f) => [f.key, f.value]));
      const toMap = Object.fromEntries(customFields.filter((f) => f.key).map((f) => [f.key, f.value]));
      for (const key of new Set([...Object.keys(fromMap), ...Object.keys(toMap)])) {
        const fromVal = fromMap[key] ?? null;
        const toVal = toMap[key] ?? null;
        if (fromVal !== toVal)
          changes[`Custom field: ${key}`] = { from: fromVal, to: toVal };
      }
    }
  }

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
  await prisma.asset.delete({ where: { id } });

  const snapshot: Record<string, string> = {};
  if (asset) {
    if (asset.model?.name) snapshot["Model"] = asset.model.name;
    if (asset.serialNumber) snapshot["Serial number"] = asset.serialNumber;
    if (asset.type?.name) snapshot["Type"] = asset.type.name;
    if (asset.manufacturer?.name) snapshot["Manufacturer"] = asset.manufacturer.name;
    if (asset.location?.name) snapshot["Location"] = asset.location.name;
    if (asset.hostname) snapshot["Hostname"] = asset.hostname;
  }

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Asset",
    entityId: id,
    entityName: asset?.model?.name ?? asset?.serialNumber ?? undefined,
    detail: Object.keys(snapshot).length > 0 ? { snapshot } : undefined,
    lineageId: asset?.lineageId,
  });
  return NextResponse.json({ ok: true });
}
