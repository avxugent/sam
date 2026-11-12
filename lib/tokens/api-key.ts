import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/permissions";

const KEY_PREFIX = "sam_mcp_";
/** Characters of the key kept in clear so the owner can tell keys apart. */
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 4;
/** lastUsedAt is refreshed at most this often, so a busy client doesn't write on every call. */
const LAST_USED_REFRESH_MS = 60 * 1000;

export type ApiKeyUser = { id: string; name: string; role: Role };

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * A fresh key (`sam_mcp_` + 256 random bits). Keys are high-entropy, so a fast
 * hash is enough to store; the plaintext is returned once and never kept.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized. Provide a valid API key as a Bearer token." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="SAM MCP"' } }
  );
}

/**
 * Resolves `Authorization: Bearer <api key>` to the key's owner, or the 401 to
 * send. The key acts with its owner's role. Revoked (deleted) and expired
 * keys are rejected.
 */
export async function apiKeyUser(
  req: Request
): Promise<{ user: ApiKeyUser; keyId: string } | { error: NextResponse }> {
  const [scheme, provided] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !provided?.startsWith(KEY_PREFIX)) {
    return { error: unauthorized() };
  }

  const now = new Date();
  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(provided) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
  });
  if (!record || (record.expiresAt && record.expiresAt <= now)) {
    return { error: unauthorized() };
  }

  if (!record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: now } });
  }

  return { user: record.user, keyId: record.id };
}
