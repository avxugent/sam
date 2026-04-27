import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 1000);

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? {
            timestamp: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}
