import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(128).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
  confirmPassword: z.string().optional(),
  locationDefaultTab: z.enum(["assets", "sublocations"]).optional(),
  monitoringPanel: z.enum(["expanded", "collapsed", "hidden"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
}).superRefine(({ newPassword, confirmPassword }, ctx) => {
  if (newPassword && newPassword !== confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, provider: true, locationDefaultTab: true, theme: true, monitoringPanel: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, currentPassword, newPassword, locationDefaultTab, theme, monitoringPanel } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, provider: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const updateData: Record<string, unknown> = {};

  if (name !== undefined) {
    updateData.name = name;
  }

  if (monitoringPanel !== undefined) {
    updateData.monitoringPanel = monitoringPanel;
  }
  if (locationDefaultTab !== undefined) {
    updateData.locationDefaultTab = locationDefaultTab;
  }

  if (theme !== undefined) {
    updateData.theme = theme;
  }

  if (newPassword) {
    if (user.provider !== "credentials") {
      return NextResponse.json({ error: "SSO accounts cannot change their password." }, { status: 400 });
    }
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    if (!user.passwordHash) {
      return NextResponse.json({ error: "No password set on this account." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    updateData.passwordHash = await bcrypt.hash(newPassword, 13);
    updateData.mustChangePassword = false;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, provider: true },
  });

  // Audit identity/security changes only. Pure preference toggles
  // (theme, locationDefaultTab, monitoringPanel) are intentionally not logged
  // as audit noise.
  const auditEvents: string[] = [];
  if (updateData.passwordHash !== undefined) auditEvents.push("Password changed");
  if (updateData.name !== undefined) auditEvents.push("Name changed");
  if (auditEvents.length > 0) {
    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "User",
      entityId: updated.id,
      entityName: updated.email ?? undefined,
      detail: { event: auditEvents.join(", ") },
    });
  }

  return NextResponse.json(updated);
}
