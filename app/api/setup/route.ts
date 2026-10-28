import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";
import { createUserSchema } from "@/lib/schemas/user";

const setupSchema = createUserSchema.pick({ name: true, email: true, password: true });

const alreadyDone = () => NextResponse.json({ error: "Setup has already been completed." }, { status: 403 });

export async function POST(req: NextRequest) {
  // Only allow setup if no users exist
  const userCount = await prisma.user.count();
  if (userCount > 0) return alreadyDone();

  const body = await readJsonBody(req);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 13);

  let admin;
  try {
    admin = await prisma.user.create({
      data: { name, email, passwordHash, role: "ADMIN" },
    });
  } catch (err) {
    // A concurrent setup request created the same admin first.
    if (isUniqueConstraintError(err)) return alreadyDone();
    throw err;
  }

  await logAudit({
    session: null,
    req,
    action: "CREATE",
    entityType: "User",
    entityId: admin.id,
    entityName: admin.email,
    detail: { event: "Initial admin created during setup", role: "ADMIN" },
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ setupRequired: userCount === 0 });
}
