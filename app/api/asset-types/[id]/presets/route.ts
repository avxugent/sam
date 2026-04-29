import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createPresetSchema } from "@/lib/work-log-schema";

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
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: assetTypeId } = await params;
  const type = await prisma.assetType.findUnique({ where: { id: assetTypeId }, select: { id: true, name: true } });
  if (!type) return NextResponse.json({ error: "Asset type not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
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
