import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const setupSchema = z.object({
  name: z.string().min(1),
  email: z.email().max(255),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    // Only allow setup if no users exist
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Setup has already been completed." },
        { status: 403 }
      );
    }

    const body = await readJsonBody(req);
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return invalidInput(parsed.error);
    }

    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 13);

    const admin = await prisma.user.create({
      data: { name, email, passwordHash, role: "ADMIN" },
    });

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
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ setupRequired: userCount === 0 });
}
