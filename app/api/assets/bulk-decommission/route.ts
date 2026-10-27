import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { assertDecommissionable } from "@/lib/asset-lifecycle";
import { DECOMMISSION_SELECT, decommissionAsset, decommissionFields, lifecycleViolationCode } from "@/lib/asset-transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  ...decommissionFields,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const { ids, ...input } = parsed.data;

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const existing = await prisma.asset.findUnique({ where: { id }, select: DECOMMISSION_SELECT });
    const reason = existing ? lifecycleViolationCode(() => assertDecommissionable(existing)) : "NOT_FOUND";
    if (!existing || reason) {
      failed.push({ id, reason: reason ?? "NOT_FOUND" });
      continue;
    }
    await decommissionAsset(req, session, id, existing, input);
    succeeded.push(id);
  }

  return NextResponse.json({ succeeded, failed });
}
