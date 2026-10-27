import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  manufacturerId: z.string().min(1),
  scrapeTargetTemplate: z.string().min(1).max(10000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: typeId } = await params;
  const overrides = await prisma.assetTypeManufacturerTemplate.findMany({
    where: { typeId },
    select: {
      id: true,
      manufacturerId: true,
      scrapeTargetTemplate: true,
      manufacturer: { select: { name: true } },
    },
    orderBy: { manufacturer: { name: "asc" } },
  });

  return NextResponse.json(
    overrides.map((o) => ({
      id: o.id,
      manufacturerId: o.manufacturerId,
      manufacturerName: o.manufacturer.name,
      scrapeTargetTemplate: o.scrapeTargetTemplate,
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: typeId } = await params;
  const type = await prisma.assetType.findUnique({ where: { id: typeId }, select: { id: true, name: true } });
  if (!type) return NextResponse.json({ error: "Asset type not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const templateErrors = validateTemplate(parsed.data.scrapeTargetTemplate);
  if (templateErrors.length > 0) {
    return NextResponse.json(
      { error: "Template syntax error", details: templateErrors },
      { status: 400 }
    );
  }

  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: parsed.data.manufacturerId },
    select: { id: true, name: true },
  });
  if (!manufacturer) return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 });

  try {
    const created = await prisma.assetTypeManufacturerTemplate.create({
      data: {
        typeId,
        manufacturerId: parsed.data.manufacturerId,
        scrapeTargetTemplate: parsed.data.scrapeTargetTemplate,
      },
    });

    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "AssetTypeManufacturerTemplate",
      entityId: created.id,
      entityName: `${type.name} / ${manufacturer.name}`,
    });

    return NextResponse.json(
      {
        id: created.id,
        manufacturerId: created.manufacturerId,
        manufacturerName: manufacturer.name,
        scrapeTargetTemplate: created.scrapeTargetTemplate,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: `${manufacturer.name} already has a scrape template override for this asset type.` },
        { status: 409 }
      );
    }
    throw err;
  }
}
