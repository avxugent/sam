import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { serializeStockMetadata } from "@/lib/stock-metadata";
import { createStockItemSchema } from "@/lib/schemas/stock";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const typeId = searchParams.get("typeId");
  const locationId = searchParams.get("locationId");
  const q = searchParams.get("q");

  const items = await prisma.stockItem.findMany({
    where: {
      ...(typeId ? { typeId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(q
        ? {
            OR: [
              { model: { name: { contains: q } } },
              { serialNumber: { contains: q } },
              { notes: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      type: true,
      manufacturer: true,
      model: true,
      location: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = createStockItemSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { invoiceDate, macAddresses, ...rest } = parsed.data;
  const item = await prisma.stockItem.create({
    data: {
      ...rest,
      manufacturerId: rest.manufacturerId ?? null,
      serialNumber: rest.serialNumber ?? null,
      notes: rest.notes ?? null,
      locationId: rest.locationId ?? null,
      reservedForLocationId: rest.reservedForLocationId ?? null,
      invoiceNumber: rest.invoiceNumber ?? null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      metadata: serializeStockMetadata({ macAddresses: macAddresses?.map((address) => ({ address })) }),
    },
    include: { type: true, manufacturer: true, model: true, location: { select: { id: true, name: true } } },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "StockItem",
    entityId: item.id,
    entityName: item.model?.name,
    detail: {
      snapshot: {
        "Type": item.type.name,
        ...(item.manufacturer ? { "Manufacturer": item.manufacturer.name } : {}),
        "Model": item.model?.name ?? null,
        "Quantity": String(item.quantity),
      },
    },
    lineageId: item.lineageId,
  });

  return NextResponse.json(item, { status: 201 });
}
