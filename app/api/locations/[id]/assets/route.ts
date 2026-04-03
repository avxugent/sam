import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const MAX_CUSTOM_FIELDS = 50;
const MAX_MAC_ADDRESSES = 20;

const FQDN_REGEX =
  /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const MAC_REGEX =
  /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

const customFieldSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
});

const createAssetSchema = z
  .object({
    typeId: z.string().min(1, "Type is required"),
    manufacturerId: z.string().min(1, "Manufacturer is required"),
    model: z.string().min(1, "Model is required").max(255),
    serialNumber: z.string().max(100).optional().nullable(),
    hostname: z
      .string()
      .max(255)
      .optional()
      .nullable()
      .refine(
        (v) => !v || FQDN_REGEX.test(v.trim()),
        "Hostname must be a valid fully qualified domain name"
      ),
    installationDate: z.string().optional().nullable(),
    invoiceNumber: z.string().max(100).optional().nullable(),
    invoiceDate: z.string().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    vaultPath: z.string().max(500).optional().nullable(),
    macAddresses: z
      .array(
        z.string().regex(MAC_REGEX, "Invalid MAC address format")
      )
      .max(MAX_MAC_ADDRESSES)
      .optional(),
    customFields: z.array(customFieldSchema).max(MAX_CUSTOM_FIELDS).optional(),
  })
  .superRefine((data, ctx) => {
    const hostnameSet = !!data.hostname?.trim();
    const hasValidMac = (data.macAddresses ?? []).some(
      (m) => m.trim() !== "" && MAC_REGEX.test(m.trim())
    );
    if (hostnameSet && !hasValidMac) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["macAddresses"],
        message: "At least one MAC address is required when hostname is set.",
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

  if (recursive) {
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
