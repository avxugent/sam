import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

// FI number format: CC.BB.FFF.RRR  e.g. "14.10.100.013"
const FI_NUMBER_REGEX = /^\d{2}\.\d{2}\.\d{3}\.\d{3}$/;

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
  fiNumber: z
    .string()
    .max(20)
    .regex(FI_NUMBER_REGEX, "FI number must be in format CC.BB.FFF.RRR (e.g. 14.10.100.013)")
    .optional()
    .nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
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

  let location;
  try {
    location = await prisma.location.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        parentId: parsed.data.parentId ?? null,
        fiNumber: parsed.data.fiNumber ?? null,
        address: parsed.data.address ?? null,
        city: parsed.data.city ?? null,
        country: parsed.data.country ?? null,
      },
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This FI number is already assigned to another location." },
        { status: 409 }
      );
    }
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Location",
    entityId: location.id,
    entityName: location.name,
  });

  return NextResponse.json(location, { status: 201 });
}
