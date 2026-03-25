import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createAssetSchema = z.object({
  typeId: z.string().nullable().optional(),
  manufacturerId: z.string().nullable().optional(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  hostname: z.string().optional().nullable(),
  installationDate: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  macAddresses: z.array(z.string()).optional(),
  customFields: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
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

  if (recursive) {
    // Collect all descendant location IDs
    const ids = await getAllDescendantIds(id);
    ids.push(id);

    const assets = await prisma.asset.findMany({
      where: { locationId: { in: ids } },
      include: {
        type: true,
        manufacturer: true,
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
    where: { locationId: id },
    include: {
      type: true,
      manufacturer: true,
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { macAddresses, customFields, installationDate, invoiceDate, ...assetData } = parsed.data;

  const asset = await prisma.asset.create({
    data: {
      ...assetData,
      locationId: id,
      installationDate: installationDate ? new Date(installationDate) : null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
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
      macAddresses: true,
      customFields: true,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}

async function getAllDescendantIds(locationId: string): Promise<string[]> {
  const children = await prisma.location.findMany({
    where: { parentId: locationId },
    select: { id: true },
  });
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    const childIds = await getAllDescendantIds(child.id);
    ids.push(...childIds);
  }
  return ids;
}
