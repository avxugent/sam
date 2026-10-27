import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const schema = z.object({ name: z.string().min(1).max(255) });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.assetType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const type = await prisma.assetType.create({ data: { name: parsed.data.name } });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "AssetType",
      entityId: type.id,
      entityName: type.name,
    });
    return NextResponse.json(type, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Name already exists." }, { status: 400 });
  }
}
