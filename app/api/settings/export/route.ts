import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readExportSettings, writeExportSettings } from "@/lib/app-settings";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  cronExpression: z.string().max(100).optional().nullable(),
  outputDir: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(await readExportSettings());
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const written = await writeExportSettings(parsed.data);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Export settings",
    detail: written,
  });

  return NextResponse.json({ ok: true });
}
