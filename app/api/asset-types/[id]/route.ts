import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";
import { validateHostnamePattern } from "@/lib/hostname/pattern";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { Criticality } from "@/generated/prisma/enums";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, isRecordNotFoundError, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  name: z.string().min(1).max(255).optional(),
  scrapeTargetTemplate: z.string().max(10000).optional().nullable(),
  prometheusExposed: z.boolean().optional(),
  hostnamePattern: z.string().max(500).optional().nullable(),
  defaultCriticality: z.enum(Criticality).optional().nullable(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

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
        ...(parsed.data.scrapeTargetTemplate !== undefined && { scrapeTargetTemplate: parsed.data.scrapeTargetTemplate ?? null }),
        ...(parsed.data.prometheusExposed !== undefined && { prometheusExposed: parsed.data.prometheusExposed }),
        ...(parsed.data.hostnamePattern !== undefined && { hostnamePattern: parsed.data.hostnamePattern ?? null }),
        ...(parsed.data.defaultCriticality !== undefined && { defaultCriticality: parsed.data.defaultCriticality ?? null }),
      },
    });

    const d = parsed.data;
    const changes = before
      ? auditChanges([
          d.name !== undefined && { label: "Name", before: before.name, after: d.name },
          d.scrapeTargetTemplate !== undefined && { label: "Scrape template", before: before.scrapeTargetTemplate, after: d.scrapeTargetTemplate ?? null },
          d.prometheusExposed !== undefined && { label: "Prometheus exposed", before: before.prometheusExposed, after: d.prometheusExposed },
          d.hostnamePattern !== undefined && { label: "Hostname pattern", before: before.hostnamePattern, after: d.hostnamePattern ?? null },
          d.defaultCriticality !== undefined && { label: "Default criticality", before: before.defaultCriticality, after: d.defaultCriticality ?? null },
        ])
      : {};

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
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return NextResponse.json({ error: "Asset type not found." }, { status: 404 });
    }
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Name already exists." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const count = await prisma.asset.count({ where: { typeId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This type is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }
  const modelCount = await prisma.model.count({ where: { typeId: id } });
  if (modelCount > 0) {
    return NextResponse.json(
      { error: `This type has ${modelCount} model(s) defined. Delete or reassign them first.` },
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
