import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

/**
 * PUT /api/assets/[id]/firmware
 *
 * Records an installed firmware version by hand, for devices with no API to
 * ask. Many AV devices are only reachable by ICMP or TCP probe and can never
 * report a version, so without this they stay permanently unmeasured and the
 * NIS2 coverage figure can never rise above the API-capable subset.
 *
 * An attestation is evidence like any other and ages the same way: it sets
 * firmwareCheckedAt, so it becomes *stale* once older than
 * compliance.firmwareMaxAgeDays. Someone must look again, which is the point —
 * a one-off entry that counted forever would be worse than no entry at all.
 *
 * DELETE clears the attestation, returning the asset to no_data.
 */

const schema = z.object({
  version: z.string().min(1).max(100),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A version is required." }, { status: 400 });

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, hostname: true, firmwareVersion: true, firmwareSource: true },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const version = parsed.data.version.trim();

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      firmwareVersion: version,
      firmwareCheckedAt: new Date(),
      firmwareSource: "ATTESTED",
      firmwareAttestedById: session.user.id,
    },
    select: {
      firmwareVersion: true,
      firmwareCheckedAt: true,
      firmwareSource: true,
      firmwareAttestedById: true,
    },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: asset.hostname ?? id,
    detail: {
      firmwareVersion: `${asset.firmwareVersion ?? "(none)"} → ${version}`,
      firmwareSource: "ATTESTED",
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, hostname: true, firmwareVersion: true, firmwareSource: true },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only an attestation can be withdrawn here. A reported version belongs to
  // the exporter, and clearing it would just be undone by the next sync.
  if (asset.firmwareSource !== "ATTESTED") {
    return NextResponse.json(
      { error: "This version was reported by the device, not attested." },
      { status: 400 }
    );
  }

  await prisma.asset.update({
    where: { id },
    data: {
      firmwareVersion: null,
      firmwareCheckedAt: null,
      firmwareSource: null,
      firmwareAttestedById: null,
    },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: asset.hostname ?? id,
    detail: { firmwareVersion: `${asset.firmwareVersion ?? "(none)"} → (cleared)` },
  });

  return NextResponse.json({ ok: true });
}
