import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const createSchema = z
  .object({
    typeId: z.string().min(1, "Type is required"),
    manufacturerId: z.string().min(1).optional().nullable(),
    model: z.string().min(1, "Model is required").max(255),
    serialNumber: z.string().max(100).optional().nullable(),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().max(5000).optional().nullable(),
    reservedForLocationId: z.string().optional().nullable(),
    invoiceNumber: z.string().max(100).optional().nullable(),
    invoiceDate: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumber && data.quantity > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be 1 when a serial number is set.",
      });
    }
  });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const typeId = searchParams.get("typeId");
  const q = searchParams.get("q");

  const items = await prisma.stockItem.findMany({
    where: {
      ...(typeId ? { typeId } : {}),
      ...(q
        ? {
            OR: [
              { model: { contains: q } },
              { serialNumber: { contains: q } },
              { notes: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      type: true,
      manufacturer: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { invoiceDate, ...rest } = parsed.data;
  const item = await prisma.stockItem.create({
    data: {
      ...rest,
      manufacturerId: rest.manufacturerId ?? null,
      serialNumber: rest.serialNumber ?? null,
      notes: rest.notes ?? null,
      reservedForLocationId: rest.reservedForLocationId ?? null,
      invoiceNumber: rest.invoiceNumber ?? null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
    },
    include: { type: true, manufacturer: true },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "StockItem",
    entityId: item.id,
    entityName: item.model,
    detail: {
      snapshot: {
        "Type": item.type.name,
        ...(item.manufacturer ? { "Manufacturer": item.manufacturer.name } : {}),
        "Model": item.model,
        "Quantity": String(item.quantity),
      },
    },
  });

  return NextResponse.json(item, { status: 201 });
}
