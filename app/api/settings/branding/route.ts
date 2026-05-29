import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  appTitle: z.string().min(1).max(100).optional(),
  backgroundMode: z.enum(["", "preset:testing"]).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "app.title",
          "branding.logoStorageKey",
          "branding.faviconStorageKey",
          "branding.backgroundMode",
          "branding.backgroundStorageKey",
        ],
      },
    },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

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
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });

  const ops: Promise<unknown>[] = [];

  if (parsed.data.appTitle !== undefined) {
    ops.push(
      prisma.appSetting.upsert({
        where: { key: "app.title" },
        update: { value: parsed.data.appTitle },
        create: { key: "app.title", value: parsed.data.appTitle },
      })
    );
  }

  if (parsed.data.backgroundMode !== undefined) {
    if (parsed.data.backgroundMode === "") {
      ops.push(prisma.appSetting.deleteMany({ where: { key: "branding.backgroundMode" } }));
    } else {
      ops.push(
        prisma.appSetting.upsert({
          where: { key: "branding.backgroundMode" },
          update: { value: parsed.data.backgroundMode },
          create: { key: "branding.backgroundMode", value: parsed.data.backgroundMode },
        })
      );
    }
  }

  await Promise.all(ops);

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
