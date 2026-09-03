import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  scrapeTargetTemplate: z.string().min(1).max(10000),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.assetTypeModelTemplate.findUnique({
    where: { id },
    include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
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

  const updated = await prisma.assetTypeModelTemplate.update({
    where: { id },
    data: { scrapeTargetTemplate: parsed.data.scrapeTargetTemplate },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "AssetTypeModelTemplate",
    entityId: id,
    entityName: `${existing.type.name} / ${existing.manufacturer.name} / ${existing.model}`,
  });

  return NextResponse.json({
    id: updated.id,
    manufacturerId: updated.manufacturerId,
    manufacturerName: existing.manufacturer.name,
    model: updated.model,
    scrapeTargetTemplate: updated.scrapeTargetTemplate,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.assetTypeModelTemplate.findUnique({
    where: { id },
    include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.assetTypeModelTemplate.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "AssetTypeModelTemplate",
    entityId: id,
    entityName: `${existing.type.name} / ${existing.manufacturer.name} / ${existing.model}`,
  });

  return new NextResponse(null, { status: 204 });
}
