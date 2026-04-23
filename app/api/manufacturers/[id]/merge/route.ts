import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ targetId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetId } = parsed.data;

  if (id === targetId) {
    return NextResponse.json({ error: "Cannot merge a manufacturer into itself." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.manufacturer.findUnique({ where: { id } }),
    prisma.manufacturer.findUnique({ where: { id: targetId } }),
  ]);

  if (!source) return NextResponse.json({ error: "Source manufacturer not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target manufacturer not found." }, { status: 404 });

  const movedCount = await prisma.$transaction(async (tx) => {
    const result = await tx.asset.updateMany({
      where: { manufacturerId: id },
      data: { manufacturerId: targetId },
    });
    await tx.manufacturer.delete({ where: { id } });
    return result.count;
  });

  return NextResponse.json({ ok: true, movedCount });
}
