import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createPresetSchema } from "@/lib/work-log-schema";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const presets = await prisma.maintenancePreset.findMany({
    where: { assetTypeId: id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(presets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: assetTypeId } = await params;
  const type = await prisma.assetType.findUnique({ where: { id: assetTypeId }, select: { id: true, name: true } });
  if (!type) return NextResponse.json({ error: "Asset type not found" }, { status: 404 });

  const body = await readJsonBody(req);
  const parsed = createPresetSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const created = await prisma.maintenancePreset.create({
    data: {
      assetTypeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "MaintenancePreset",
    entityId: created.id,
    entityName: `${type.name} / ${created.name}`,
  });

  return NextResponse.json(created, { status: 201 });
}
