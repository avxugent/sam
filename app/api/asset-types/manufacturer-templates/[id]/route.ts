import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const updateSchema = z.object({
  scrapeTargetTemplate: z.string().min(1).max(10000),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.assetTypeManufacturerTemplate.findUnique({
    where: { id },
    include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await readJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const templateErrors = validateTemplate(parsed.data.scrapeTargetTemplate);
  if (templateErrors.length > 0) {
    return NextResponse.json(
      { error: "Template syntax error", details: templateErrors },
      { status: 400 }
    );
  }

  const updated = await prisma.assetTypeManufacturerTemplate.update({
    where: { id },
    data: { scrapeTargetTemplate: parsed.data.scrapeTargetTemplate },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "AssetTypeManufacturerTemplate",
    entityId: id,
    entityName: `${existing.type.name} / ${existing.manufacturer.name}`,
  });

  return NextResponse.json({
    id: updated.id,
    manufacturerId: updated.manufacturerId,
    manufacturerName: existing.manufacturer.name,
    scrapeTargetTemplate: updated.scrapeTargetTemplate,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.assetTypeManufacturerTemplate.findUnique({
    where: { id },
    include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.assetTypeManufacturerTemplate.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "AssetTypeManufacturerTemplate",
    entityId: id,
    entityName: `${existing.type.name} / ${existing.manufacturer.name}`,
  });

  return NextResponse.json({ ok: true });
}
