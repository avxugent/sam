import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";
import { invalidInput, isUniqueConstraintError, prismaErrorCode, readJsonBody } from "@/lib/route-helpers";
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
  const passwordHash = await hashPassword(password);

  // The count above is only a fast path: two requests with different emails
  // can both pass it. Re-checking inside a Serializable transaction makes the
  // check and the insert atomic on InnoDB: the count becomes a locking read
  // (shared next-key lock on the empty User index), so a request that counts
  // after another's insert waits for its commit and sees the admin, and two
  // requests that both counted first deadlock on their inserts; InnoDB rolls
  // one back (P2034) and only the other admin is created.
  let admin;
  try {
    admin = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if ((await tx.user.count()) > 0) return null;
        return tx.user.create({ data: { name, email, passwordHash, role: "ADMIN" } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    // A concurrent setup request created the admin first.
    if (isUniqueConstraintError(err) || prismaErrorCode(err) === "P2034") return alreadyDone();
    throw err;
  }
  if (!admin) return alreadyDone();

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
