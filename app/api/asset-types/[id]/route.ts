import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateTemplate } from "@/lib/scrape-template";

const schema = z.object({
  name: z.string().min(1).max(255).optional(),
  scrapeTargetTemplate: z.string().max(10000).optional().nullable(),
});

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

  try {
    const type = await prisma.assetType.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        scrapeTargetTemplate: parsed.data.scrapeTargetTemplate ?? null,
      },
    });
    return NextResponse.json(type);
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
  const count = await prisma.asset.count({ where: { typeId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This type is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await prisma.assetType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
