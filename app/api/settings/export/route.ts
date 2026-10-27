import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSettings, writeSettings } from "@/lib/app-settings";
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

  const map = await readSettings(["export.cronExpression", "export.outputDir", "export.enabled"]);

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

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const { cronExpression, outputDir, enabled } = parsed.data;
  const written = await writeSettings({
    "export.cronExpression": cronExpression === undefined ? undefined : cronExpression ?? "",
    "export.outputDir": outputDir === undefined ? undefined : outputDir ?? "",
    "export.enabled": enabled === undefined ? undefined : String(enabled),
  });

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
