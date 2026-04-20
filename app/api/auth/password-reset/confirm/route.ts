import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(1),
}).superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, provider: true } } },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  if (record.user.provider !== "credentials") {
    return NextResponse.json({ error: "SSO accounts cannot use password reset." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 13);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash },
    });
  });

  return NextResponse.json({ ok: true });
}
