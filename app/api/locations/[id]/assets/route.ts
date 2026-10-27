import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { matchesHostnamePattern } from "@/lib/hostname-pattern";
import { normalizeMacAddress } from "@/lib/mac-address";
import { logAudit } from "@/lib/audit";
import { CRITICALITY_VALUES } from "@/lib/criticality";
import { resolveAssetCreationDefaults } from "@/lib/asset-defaults";
import { canEdit } from "@/lib/permissions";

const MAX_CUSTOM_FIELDS = 50;
const MAX_MAC_ADDRESSES = 20;

const FQDN_REGEX =
  /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// Accepts any recoverable MAC shape (colon, hyphen, dot-grouped, no
// separator, mixed case) and normalizes it to AA:BB:CC:DD:EE:FF — mirrors
// the CSV import behavior so manually created assets can't reintroduce
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

const createAssetSchema = z
  .object({
    typeId: z.string().min(1, "Type is required"),
    manufacturerId: z.string().min(1, "Manufacturer is required"),
    modelId: z.string().min(1, "Model is required"),
    serialNumber: z.string().max(100).optional().nullable(),
    hostname: z.string().max(255).optional().nullable(),
    quantity: z.number().int().min(1).max(9999).default(1),
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
    const hasIdentity = !!data.serialNumber?.trim() || hostnameSet || hasValidMac;
    if (hasIdentity && data.quantity !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be 1 when a serial number, hostname, or MAC address is set.",
      });
    }
  });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const recursive = searchParams.get("recursive") === "true";
  const statusParam = searchParams.get("status");
  const statusFilter =
    statusParam === "DECOMMISSIONED"
      ? { status: "DECOMMISSIONED" as const }
      : { status: "INSTALLED" as const };

  if (recursive) {
    const ids = await getAllDescendantIds(id);
    ids.push(id);

    const assets = await prisma.asset.findMany({
      where: { locationId: { in: ids }, ...statusFilter },
      include: {
        type: true,
        manufacturer: true,
        model: true,
        macAddresses: true,
        customFields: true,
        location: { select: { id: true, name: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(assets);
  }

  const assets = await prisma.asset.findMany({
    where: { locationId: id, ...statusFilter },
    include: {
      type: true,
      manufacturer: true,
      model: true,
      macAddresses: true,
      customFields: true,
      _count: { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { macAddresses, customFields, installationDate, invoiceDate, endOfSupportDate, ownerId, supplierId, ...assetData } = parsed.data;

  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
    if (!supplier) {
      return NextResponse.json({ error: "Unknown supplier." }, { status: 400 });
    }
  }

  const defaults = await resolveAssetCreationDefaults(prisma, { ownerId, supplierId });

  const hostnameTrimmed = assetData.hostname?.trim();
  if (hostnameTrimmed) {
    const assetType = await prisma.assetType.findUnique({
      where: { id: assetData.typeId },
      select: { hostnamePattern: true },
    });
    const isValidHostname = assetType?.hostnamePattern
      ? matchesHostnamePattern(hostnameTrimmed, assetType.hostnamePattern)
      : FQDN_REGEX.test(hostnameTrimmed);
    if (!isValidHostname) {
      return NextResponse.json(
        { error: "Hostname does not match the required format for this asset type." },
        { status: 400 }
      );
    }
  }

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        ...assetData,
        hostname: hostnameTrimmed || null,
        locationId: id,
        ownerId: defaults.ownerId,
        supplierId: defaults.supplierId,
        installationDate: installationDate ? new Date(installationDate) : null,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
        endOfSupportDate: endOfSupportDate ? new Date(endOfSupportDate) : null,
        macAddresses: macAddresses?.length
          ? { create: macAddresses.filter(Boolean).map((address) => ({ address })) }
          : undefined,
        customFields: customFields?.length
          ? { create: customFields.filter((f) => f.key).map((f) => ({ key: f.key, value: f.value })) }
          : undefined,
      },
      include: {
        type: true,
        manufacturer: true,
        model: true,
        macAddresses: true,
        customFields: true,
      },
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

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Asset",
    entityId: asset.id,
    entityName: asset.model?.name ?? asset.serialNumber ?? undefined,
    detail: {
      snapshot: {
        ...(asset.type ? { "Type": asset.type.name } : {}),
        ...(asset.manufacturer ? { "Manufacturer": asset.manufacturer.name } : {}),
        "Model": asset.model?.name ?? null,
        ...(asset.serialNumber ? { "Serial number": asset.serialNumber } : {}),
        ...(asset.quantity !== 1 ? { "Quantity": asset.quantity } : {}),
      },
    },
    lineageId: asset.lineageId,
  });

  return NextResponse.json(asset, { status: 201 });
}

// CUID format used by Prisma @default(cuid())
const CUID_REGEX = /^[0-9a-z]{25}$/;

// Uses a raw SQL recursive CTE instead of sequential round-trips
async function getAllDescendantIds(locationId: string): Promise<string[]> {
  if (!CUID_REGEX.test(locationId)) return [];
  type Row = { id: string };
  const rows = await prisma.$queryRaw<Row[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id FROM locations WHERE id = ${locationId}
      UNION ALL
      SELECT l.id FROM locations l
      INNER JOIN loc_tree lt ON l.parentId = lt.id
    )
    SELECT id FROM loc_tree WHERE id != ${locationId}
  `;
  return rows.map((r) => r.id);
}
