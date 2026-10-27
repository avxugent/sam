import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { createUserSchema } from "@/lib/schemas/user";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  provider: true,
  totpEnabled: true,
  mustChangePassword: true,
  twoFactorRequired: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return NextResponse.json({ error: "Email already in use." }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 13);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      provider: "credentials",
      mustChangePassword: parsed.data.mustChangePassword,
      twoFactorRequired: parsed.data.twoFactorRequired,
    },
    select: USER_SELECT,
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    entityName: user.email,
    detail: { snapshot: { "Name": user.name, "Email": user.email, "Role": user.role } },
  });

  return NextResponse.json(user, { status: 201 });
}
