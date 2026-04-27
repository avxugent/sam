import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const GENERAL_KEYS = ["hostname.urlTemplate", "macAddress.urlTemplate"] as const;

const schema = z.object({
  hostnameUrlTemplate: z.string().max(1000).optional().nullable(),
  macAddressUrlTemplate: z.string().max(1000).optional().nullable(),
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
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { hostnameUrlTemplate, macAddressUrlTemplate } = parsed.data;

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
  ]);

  return NextResponse.json({ ok: true });
}
