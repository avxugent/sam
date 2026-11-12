/**
 * GET  /api/users/me/api-keys — the current user's API keys (never the key itself).
 * POST /api/users/me/api-keys — create a key for the MCP endpoint.
 *   Body: { label, expiresInDays? }. The plaintext key is in this response only.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { createApiKeySchema } from "@/lib/schemas/api-key";
import { generateApiKey } from "@/lib/tokens/api-key";

const KEY_SELECT = {
  id: true,
  label: true,
  keyPrefix: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
} as const;

/** Per-user cap, so a script can't fill the table. */
const MAX_KEYS_PER_USER = 20;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: KEY_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createApiKeySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);

  const existing = await prisma.apiKey.count({ where: { userId: session.user.id } });
  if (existing >= MAX_KEYS_PER_USER) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_KEYS_PER_USER} API keys. Revoke one first.`, code: "tooManyApiKeys" },
      { status: 409 }
    );
  }

  const { key, prefix, hash } = generateApiKey();
  const { label, expiresInDays } = parsed.data;
  const created = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      label,
      keyPrefix: prefix,
      keyHash: hash,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    },
    select: KEY_SELECT,
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "ApiKey",
    entityId: created.id,
    entityName: label,
    detail: { keyPrefix: prefix, expiresAt: created.expiresAt },
  });

  return NextResponse.json({ ...created, key }, { status: 201 });
}
