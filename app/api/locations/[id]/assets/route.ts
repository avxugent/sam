import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isHostnameCompliant } from "@/lib/hostname/pattern";
import { createAssetSchema } from "@/lib/schemas/asset";
import { logAudit } from "@/lib/audit";
import { resolveAssetCreationDefaults } from "@/lib/assets/defaults";
import { canEdit } from "@/lib/permissions";
import { getAllDescendantLocationIds } from "@/lib/location-path";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";
import { assetListStatusFilter } from "@/lib/assets/list-status";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const recursive = searchParams.get("recursive") === "true";
  const statusFilter = assetListStatusFilter(searchParams.get("status"));

  if (recursive) {
    const ids = await getAllDescendantLocationIds(id);
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
  const body = await readJsonBody(req);
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
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
    const isValidHostname = isHostnameCompliant(hostnameTrimmed, assetType?.hostnamePattern);
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
    if (isUniqueConstraintError(err)) {
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
