import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { invalidInput } from "@/lib/route-helpers";
import { z } from "zod";

const date = z
  .string()
  .refine((v) => !isNaN(Date.parse(v)), "Invalid date")
  .transform((v) => new Date(v));

const querySchema = z.object({
  action: z.string().max(50).optional(),
  entityType: z.string().max(100).optional(),
  userId: z.string().max(191).optional(),
  from: date.optional(),
  to: date.optional(),
  // Larger requests are capped rather than rejected.
  limit: z.coerce.number().int().positive().default(500).transform((n) => Math.min(n, 1000)),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return invalidInput(parsed.error);
  const { action, entityType, userId, from, to, limit } = parsed.data;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? {
            timestamp: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}
