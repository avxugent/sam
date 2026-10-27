import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const schema = z.object({
  cronExpression: z.string().max(100).optional().nullable(),
  outputDir: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["export.cronExpression", "export.outputDir", "export.enabled"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return NextResponse.json({
    cronExpression: map["export.cronExpression"] ?? "0 2 * * *",
    outputDir: map["export.outputDir"] ?? "/backups",
    enabled: map["export.enabled"] === "true",
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const entries: Array<{ key: string; value: string }> = [];
  if (parsed.data.cronExpression !== undefined) {
    entries.push({ key: "export.cronExpression", value: parsed.data.cronExpression ?? "" });
  }
  if (parsed.data.outputDir !== undefined) {
    entries.push({ key: "export.outputDir", value: parsed.data.outputDir ?? "" });
  }
  if (parsed.data.enabled !== undefined) {
    entries.push({ key: "export.enabled", value: String(parsed.data.enabled) });
  }

  for (const { key, value } of entries) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Export settings",
    detail: Object.fromEntries(entries.map((e) => [e.key, e.value])),
  });

  return NextResponse.json({ ok: true });
}
