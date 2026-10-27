import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const GENERAL_KEYS = [
  "hostname.urlTemplate",
  "macAddress.urlTemplate",
  "location.urlTemplate",
] as const;

const schema = z.object({
  hostnameUrlTemplate: z.string().max(1000).optional().nullable(),
  macAddressUrlTemplate: z.string().max(1000).optional().nullable(),
  locationUrlTemplate: z.string().max(1000).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...GENERAL_KEYS] } },
  });

  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return NextResponse.json({
    hostnameUrlTemplate: map["hostname.urlTemplate"] ?? "",
    macAddressUrlTemplate: map["macAddress.urlTemplate"] ?? "",
    locationUrlTemplate: map["location.urlTemplate"] ?? "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { hostnameUrlTemplate, macAddressUrlTemplate, locationUrlTemplate } = parsed.data;

  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "hostname.urlTemplate" },
      update: { value: hostnameUrlTemplate ?? "" },
      create: { key: "hostname.urlTemplate", value: hostnameUrlTemplate ?? "" },
    }),
    prisma.appSetting.upsert({
      where: { key: "macAddress.urlTemplate" },
      update: { value: macAddressUrlTemplate ?? "" },
      create: { key: "macAddress.urlTemplate", value: macAddressUrlTemplate ?? "" },
    }),
    prisma.appSetting.upsert({
      where: { key: "location.urlTemplate" },
      update: { value: locationUrlTemplate ?? "" },
      create: { key: "location.urlTemplate", value: locationUrlTemplate ?? "" },
    }),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "General settings",
    detail: {
      "hostname.urlTemplate": hostnameUrlTemplate ?? "",
      "macAddress.urlTemplate": macAddressUrlTemplate ?? "",
      "location.urlTemplate": locationUrlTemplate ?? "",
    },
  });

  return NextResponse.json({ ok: true });
}
