import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";
import { validateHostnamePattern } from "@/lib/hostname-pattern";
import { logAudit } from "@/lib/audit";
import { CRITICALITY_VALUES } from "@/lib/criticality";

const schema = z.object({
  name: z.string().min(1).max(255).optional(),
  scrapeTargetTemplate: z.string().max(10000).optional().nullable(),
  prometheusExposed: z.boolean().optional(),
  hostnamePattern: z.string().max(500).optional().nullable(),
  defaultCriticality: z.enum(CRITICALITY_VALUES).optional().nullable(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Validate template syntax if provided
  if (parsed.data.scrapeTargetTemplate) {
    const templateErrors = validateTemplate(parsed.data.scrapeTargetTemplate);
    if (templateErrors.length > 0) {
      return NextResponse.json(
        { error: "Template syntax error", details: templateErrors },
        { status: 400 }
      );
    }
  }

  // Validate hostname regex syntax if provided
  if (parsed.data.hostnamePattern) {
    const patternError = validateHostnamePattern(parsed.data.hostnamePattern);
    if (patternError) {
      return NextResponse.json(
        { error: "Invalid hostname pattern", details: [patternError] },
        { status: 400 }
      );
    }
  }

  const before = await prisma.assetType.findUnique({
    where: { id },
    select: { name: true, scrapeTargetTemplate: true, prometheusExposed: true, hostnamePattern: true, defaultCriticality: true },
  });

  // Check for name conflict before attempting update
  if (parsed.data.name !== undefined) {
    const conflict = await prisma.assetType.findFirst({
      where: { name: parsed.data.name, NOT: { id } },
      select: { id: true, name: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `An asset type named "${parsed.data.name}" already exists.`, conflict: "name", existingId: conflict.id },
        { status: 409 }
      );
    }
  }

  try {
    const type = await prisma.assetType.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        scrapeTargetTemplate: parsed.data.scrapeTargetTemplate ?? null,
        ...(parsed.data.prometheusExposed !== undefined && { prometheusExposed: parsed.data.prometheusExposed }),
        ...(parsed.data.hostnamePattern !== undefined && { hostnamePattern: parsed.data.hostnamePattern ?? null }),
        ...(parsed.data.defaultCriticality !== undefined && { defaultCriticality: parsed.data.defaultCriticality ?? null }),
      },
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (before) {
      if (parsed.data.name !== undefined && parsed.data.name !== before.name)
        changes["Name"] = { from: before.name, to: parsed.data.name };
      if (parsed.data.scrapeTargetTemplate !== undefined && parsed.data.scrapeTargetTemplate !== before.scrapeTargetTemplate)
        changes["Scrape template"] = { from: before.scrapeTargetTemplate ?? null, to: parsed.data.scrapeTargetTemplate ?? null };
      if (parsed.data.prometheusExposed !== undefined && parsed.data.prometheusExposed !== before.prometheusExposed)
        changes["Prometheus exposed"] = { from: before.prometheusExposed, to: parsed.data.prometheusExposed };
      if (parsed.data.hostnamePattern !== undefined && parsed.data.hostnamePattern !== before.hostnamePattern)
        changes["Hostname pattern"] = { from: before.hostnamePattern ?? null, to: parsed.data.hostnamePattern ?? null };
      if (parsed.data.defaultCriticality !== undefined && parsed.data.defaultCriticality !== before.defaultCriticality)
        changes["Default criticality"] = { from: before.defaultCriticality ?? null, to: parsed.data.defaultCriticality ?? null };
    }

    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "AssetType",
      entityId: id,
      entityName: type.name,
      detail: Object.keys(changes).length > 0 ? { changes } : undefined,
    });
    return NextResponse.json(type);
  } catch {
    return NextResponse.json({ error: "Asset type not found." }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const count = await prisma.asset.count({ where: { typeId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This type is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }

  const assetType = await prisma.assetType.findUnique({ where: { id }, select: { name: true } });
  await prisma.assetType.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "AssetType",
    entityId: id,
    entityName: assetType?.name,
  });
  return NextResponse.json({ ok: true });
}
