import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readComplianceSettings, writeComplianceSettings } from "@/lib/app-settings";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { MAX_ID_LENGTH } from "@/lib/schemas/ids";

const schema = z.object({
  requireTwoFactor: z.boolean().optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
  defaultOwnerId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  reviewWorkLogItemId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  reviewPeriodMonths: z.number().int().min(1).max(120).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(await readComplianceSettings());
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const written = await writeComplianceSettings(parsed.data);

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
