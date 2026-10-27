import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSettings, writeSettings } from "@/lib/app-settings";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

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

  const map = await readSettings(KEYS);

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

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const d = parsed.data;
  const written = await writeSettings({
    "security.requireTwoFactor": d.requireTwoFactor === undefined ? undefined : String(d.requireTwoFactor),
    "audit.retentionDays": d.auditRetentionDays === undefined ? undefined : String(d.auditRetentionDays),
    "assets.defaultOwnerId": d.defaultOwnerId === undefined ? undefined : d.defaultOwnerId ?? "",
    "compliance.reviewWorkLogItemId": d.reviewWorkLogItemId === undefined ? undefined : d.reviewWorkLogItemId ?? "",
    "compliance.reviewPeriodMonths": d.reviewPeriodMonths === undefined ? undefined : String(d.reviewPeriodMonths),
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Compliance settings",
    detail: written,
  });

  return NextResponse.json({ ok: true });
}
