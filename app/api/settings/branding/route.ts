import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readSettings, writeSettings } from "@/lib/app-settings";
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

  const map = await readSettings([
    "app.title",
    "branding.logoStorageKey",
    "branding.faviconStorageKey",
    "branding.backgroundMode",
    "branding.backgroundStorageKey",
  ]);

  return NextResponse.json({
    appTitle: map["app.title"] ?? "SAM",
    hasLogo: !!map["branding.logoStorageKey"],
    hasFavicon: !!map["branding.faviconStorageKey"],
    backgroundMode: map["branding.backgroundMode"] ?? "",
    hasCustomBackground: !!map["branding.backgroundStorageKey"],
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const { appTitle, backgroundMode } = parsed.data;
  // An empty background mode means "default": the setting is removed rather than stored.
  await Promise.all([
    writeSettings({ "app.title": appTitle, "branding.backgroundMode": backgroundMode || undefined }),
    backgroundMode === "" ? prisma.appSetting.deleteMany({ where: { key: "branding.backgroundMode" } }) : null,
  ]);

  const detail: Record<string, unknown> = {};
  if (parsed.data.appTitle !== undefined) detail["app.title"] = parsed.data.appTitle;
  if (parsed.data.backgroundMode !== undefined) detail["branding.backgroundMode"] = parsed.data.backgroundMode || "(none)";

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail,
  });

  return NextResponse.json({ ok: true });
}
