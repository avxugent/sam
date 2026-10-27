import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { isAdmin } from "@/lib/permissions";
import { updateUserSchema } from "@/lib/schemas/user";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const target = await prisma.user.findUnique({
    where: { id },
    select: { provider: true, name: true, email: true, role: true, twoFactorRequired: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isAdmin(target.role) && parsed.data.role !== undefined && !isAdmin(parsed.data.role)) {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Cannot demote the last admin account." }, { status: 400 });
    }
  }

  const { password, ...data } = parsed.data;
  const updateData: Record<string, unknown> = { ...data };

  if (password) {
    // Cannot set password for SSO users
    if (target.provider !== "credentials") {
      return NextResponse.json(
        { error: "Cannot set a password for an SSO user." },
        { status: 400 }
      );
    }
    updateData.passwordHash = await bcrypt.hash(password, 13);
    // Admin password reset forces user to change it on next login
    updateData.mustChangePassword = true;
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, provider: true, totpEnabled: true, mustChangePassword: true, twoFactorRequired: true, createdAt: true },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }
    throw err;
  }

  const d = parsed.data;
  const changes = auditChanges([
    d.name !== undefined && { label: "Name", before: target.name, after: d.name },
    d.email !== undefined && { label: "Email", before: target.email, after: d.email },
    d.role !== undefined && { label: "Role", before: target.role, after: d.role },
    d.twoFactorRequired !== undefined && { label: "2FA required", before: target.twoFactorRequired, after: d.twoFactorRequired },
    // A new password always counts as a change; never record password material.
    !!password && { label: "Password", before: false, after: true, display: ["•••", "•••"] },
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "User",
    entityId: id,
    entityName: user.email,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
  });

  return NextResponse.json(user);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const userToDelete = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!userToDelete) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (isAdmin(userToDelete.role) && adminCount <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin account." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "User",
    entityId: id,
    entityName: userToDelete.email,
    detail: { snapshot: { Email: userToDelete.email, Role: userToDelete.role } },
  });
  return NextResponse.json({ ok: true });
}
