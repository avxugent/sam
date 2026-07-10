import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.asset.findUnique({ where: { id }, select: { model: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "INSTALLED") {
    return NextResponse.json({ error: "Asset is not decommissioned." }, { status: 400 });
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      status: "INSTALLED",
      decommissionedAt: null,
      decommissionNote: null,
      disposalMethod: null,
      decommissionedById: null,
    },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model ?? undefined,
    detail: { status: "INSTALLED" },
  });

  return NextResponse.json(asset);
}
