import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const MAC_REGEX =
  /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

const updateSchema = z
  .object({
    typeId: z.string().min(1).optional(),
    manufacturerId: z.string().min(1).optional().nullable(),
    model: z.string().min(1).max(255).optional(),
    serialNumber: z.string().max(100).optional().nullable(),
    quantity: z.number().int().min(1).optional(),
    notes: z.string().max(5000).optional().nullable(),
    reservedForLocationId: z.string().optional().nullable(),
    invoiceNumber: z.string().max(100).optional().nullable(),
    invoiceDate: z.string().optional().nullable(),
    macAddress: z
      .string()
      .regex(MAC_REGEX, "Invalid MAC address")
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumber && data.quantity !== undefined && data.quantity > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be 1 when a serial number is set.",
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
  const item = await prisma.stockItem.findUnique({
    where: { id },
    select: {
      id: true,
      typeId: true,
      manufacturerId: true,
      model: true,
      serialNumber: true,
      quantity: true,
      notes: true,
      invoiceNumber: true,
      invoiceDate: true,
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.stockItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { invoiceDate, macAddress, ...rest } = parsed.data;

  // Merge MAC into the metadata blob, preserving any other keys (hostname,
  // customFields, …) that may have been stored when the item came from an asset.
  let metadataUpdate: { metadata: string | null } | Record<string, never> = {};
  if (macAddress !== undefined) {
    let meta: Record<string, unknown> = {};
    if (existing.metadata) {
      try { meta = JSON.parse(existing.metadata) as Record<string, unknown>; } catch { /* ignore */ }
    }
    const mac = macAddress?.trim();
    if (mac) meta.macAddresses = [{ address: mac }];
    else delete meta.macAddresses;
    metadataUpdate = { metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null };
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
    include: { type: true, manufacturer: true },
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const d = parsed.data;
  if (d.model !== undefined && d.model !== existing.model)
    changes["Model"] = { from: existing.model, to: d.model };
  if (d.serialNumber !== undefined && d.serialNumber !== existing.serialNumber)
    changes["Serial number"] = { from: existing.serialNumber ?? null, to: d.serialNumber ?? null };
  if (d.quantity !== undefined && d.quantity !== existing.quantity)
    changes["Quantity"] = { from: existing.quantity, to: d.quantity };
  if (d.notes !== undefined && d.notes !== existing.notes)
    changes["Notes"] = { from: existing.notes ?? null, to: d.notes ?? null };
  if (d.invoiceNumber !== undefined && d.invoiceNumber !== existing.invoiceNumber)
    changes["Invoice number"] = { from: existing.invoiceNumber ?? null, to: d.invoiceNumber ?? null };

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "StockItem",
    entityId: id,
    entityName: item.model,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
  });

  return NextResponse.json(item);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const item = await prisma.stockItem.findUnique({ where: { id }, select: { model: true } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.stockItem.delete({ where: { id } });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "StockItem",
    entityId: id,
    entityName: item.model,
  });

  return NextResponse.json({ ok: true });
}
