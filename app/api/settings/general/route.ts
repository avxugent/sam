import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readGeneralSettings, writeGeneralSettings } from "@/lib/app-settings";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  hostnameUrlTemplate: z.string().max(1000).optional().nullable(),
  macAddressUrlTemplate: z.string().max(1000).optional().nullable(),
  locationUrlTemplate: z.string().max(1000).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await readGeneralSettings());
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const { hostnameUrlTemplate, macAddressUrlTemplate, locationUrlTemplate } = parsed.data;

  // All three templates are always written; an omitted one is cleared.
  const written = await writeGeneralSettings({
    hostnameUrlTemplate: hostnameUrlTemplate ?? "",
    macAddressUrlTemplate: macAddressUrlTemplate ?? "",
    locationUrlTemplate: locationUrlTemplate ?? "",
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "General settings",
    detail: written,
  });

  return NextResponse.json({ ok: true });
}
