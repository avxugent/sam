import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locations = await prisma.location.findMany({
    where: { parentId: null },
    include: {
      _count: { select: { assets: true, children: true } },
      children: {
        include: {
          _count: { select: { assets: true, children: true } },
          children: {
            include: {
              _count: { select: { assets: true, children: true } },
            },
            orderBy: [{ order: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(locations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const location = await prisma.location.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      parentId: parsed.data.parentId ?? null,
    },
  });

  return NextResponse.json(location, { status: 201 });
}
