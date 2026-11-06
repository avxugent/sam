import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readBrandingSettings, writeBrandingSettings } from "@/lib/app-settings";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { SELECTABLE_BACKGROUND_MODES } from "@/lib/branding/background-mode";

const schema = z.object({
  appTitle: z.string().min(1).max(100).optional(),
  backgroundMode: z.enum(SELECTABLE_BACKGROUND_MODES).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await readBrandingSettings());
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const written = await writeBrandingSettings(parsed.data);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: written,
  });

  return NextResponse.json({ ok: true });
}
