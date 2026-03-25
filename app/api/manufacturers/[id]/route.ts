import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1) });

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

  try {
    const manufacturer = await prisma.manufacturer.update({ where: { id }, data: { name: parsed.data.name } });
    return NextResponse.json(manufacturer);
  } catch {
    return NextResponse.json({ error: "Name already exists or not found." }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const count = await prisma.asset.count({ where: { manufacturerId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This manufacturer is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await prisma.manufacturer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
