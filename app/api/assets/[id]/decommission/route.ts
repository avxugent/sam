import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { assertDecommissionable } from "@/lib/assets/lifecycle-rules";
import { DECOMMISSION_SELECT, decommissionAsset, decommissionFields, lifecycleViolationResponse } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object(decommissionFields);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.asset.findUnique({ where: { id }, select: DECOMMISSION_SELECT });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const violation = lifecycleViolationResponse(() => assertDecommissionable(existing));
  if (violation) return violation;

  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);

  return NextResponse.json(await decommissionAsset(req, session, id, existing, parsed.data));
}
