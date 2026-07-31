import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  typeId: z.string().min(1),
  // Empty string from the form means "every model of this type". Stored as
  // null so the unique constraint treats it as the single type-wide row.
  model: z.string().max(255).optional().nullable(),
  approvedVersion: z.string().min(1).max(100),
  notes: z.string().max(2000).optional().nullable(),
});

function normalizeModel(model: string | null | undefined): string | null {
  const trimmed = model?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baselines = await prisma.firmwareBaseline.findMany({
    orderBy: [{ type: { name: "asc" } }, { model: "asc" }],
    include: { type: { select: { id: true, name: true } } },
  });
  return NextResponse.json(baselines);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { typeId, approvedVersion, notes } = parsed.data;
  const model = normalizeModel(parsed.data.model);

  try {
    const baseline = await prisma.firmwareBaseline.create({
      data: { typeId, model, approvedVersion: approvedVersion.trim(), notes: notes || null },
      include: { type: { select: { id: true, name: true } } },
    });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "FirmwareBaseline",
      entityId: baseline.id,
      entityName: `${baseline.type.name} / ${baseline.model ?? "all models"}`,
      detail: { approvedVersion: baseline.approvedVersion },
    });
    return NextResponse.json(baseline, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A baseline already exists for this asset type and model." },
      { status: 400 }
    );
  }
}
