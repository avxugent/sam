import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const MAX_CUSTOM_FIELDS = 50;
const MAX_MAC_ADDRESSES = 20;

const customFieldSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
});

const updateSchema = z.object({
  locationId: z.string().optional(),
  typeId: z.string().nullable().optional(),
  manufacturerId: z.string().nullable().optional(),
  model: z.string().max(255).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  hostname: z.string().max(255).optional().nullable(),
  installationDate: z.string().optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  vaultPath: z.string().max(500).optional().nullable(),
  macAddresses: z.array(z.string().max(17)).max(MAX_MAC_ADDRESSES).optional(),
  customFields: z.array(customFieldSchema).max(MAX_CUSTOM_FIELDS).optional(),
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { macAddresses, customFields, installationDate, invoiceDate, ...assetData } = parsed.data;

  const asset = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        installationDate: installationDate !== undefined
          ? installationDate ? new Date(installationDate) : null
          : undefined,
        invoiceDate: invoiceDate !== undefined
          ? invoiceDate ? new Date(invoiceDate) : null
          : undefined,
      },
      include: {
        type: true,
        manufacturer: true,
        macAddresses: true,
        customFields: true,
      },
    });
  });

  return NextResponse.json(asset);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.asset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
