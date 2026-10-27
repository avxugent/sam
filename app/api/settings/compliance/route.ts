import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const KEYS = [
  "security.requireTwoFactor",
  "audit.retentionDays",
  "assets.defaultOwnerId",
  "compliance.reviewWorkLogItemId",
  "compliance.reviewPeriodMonths",
] as const;

const schema = z.object({
  requireTwoFactor: z.boolean().optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
  defaultOwnerId: z.string().max(64).optional().nullable(),
  reviewWorkLogItemId: z.string().max(64).optional().nullable(),
  reviewPeriodMonths: z.number().int().min(1).max(120).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...KEYS] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return NextResponse.json({
    requireTwoFactor: map["security.requireTwoFactor"] === "true",
    auditRetentionDays: parseInt(map["audit.retentionDays"] ?? "730", 10),
    defaultOwnerId: map["assets.defaultOwnerId"] || null,
    reviewWorkLogItemId: map["compliance.reviewWorkLogItemId"] || null,
    reviewPeriodMonths: parseInt(map["compliance.reviewPeriodMonths"] ?? "12", 10),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });

  const entries: Array<{ key: string; value: string }> = [];
  if (parsed.data.requireTwoFactor !== undefined) {
    entries.push({ key: "security.requireTwoFactor", value: String(parsed.data.requireTwoFactor) });
  }
  if (parsed.data.auditRetentionDays !== undefined) {
    entries.push({ key: "audit.retentionDays", value: String(parsed.data.auditRetentionDays) });
  }
  if (parsed.data.defaultOwnerId !== undefined) {
    entries.push({ key: "assets.defaultOwnerId", value: parsed.data.defaultOwnerId ?? "" });
  }
  if (parsed.data.reviewWorkLogItemId !== undefined) {
    entries.push({ key: "compliance.reviewWorkLogItemId", value: parsed.data.reviewWorkLogItemId ?? "" });
  }
  if (parsed.data.reviewPeriodMonths !== undefined) {
    entries.push({ key: "compliance.reviewPeriodMonths", value: String(parsed.data.reviewPeriodMonths) });
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
    entityName: "Compliance settings",
    detail: Object.fromEntries(entries.map((e) => [e.key, e.value])),
  });

  return NextResponse.json({ ok: true });
}
