/**
 * GET /api/users/lite
 *
 * Minimal user list ({id, name} only) for the asset form's owner dropdown.
 * EDITOR and ADMIN — deliberately narrower payload than the ADMIN-only
 * /api/users (no emails, roles or 2FA state).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}
