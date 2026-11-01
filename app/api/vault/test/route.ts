/**
 * GET /api/vault/test?path=<vaultPath>
 *
 * Tests a Vault KV secret path and returns the key names (NOT values)
 * so the user can verify their configuration without exposing secrets
 * in the browser or network logs.
 *
 * Authentication: standard NextAuth session; any role that can edit assets (canEdit).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isVaultConfigured, listVaultSecretKeys } from "@/lib/integrations/vault";
import { canEdit } from "@/lib/permissions";
import { invalidInput } from "@/lib/route-helpers";

// Same cap as an asset's vaultPath.
const querySchema = z.object({
  path: z.string().trim().min(1).max(500),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isVaultConfigured()) {
    return NextResponse.json(
      { error: "Vault is not configured on this server. Set VAULT_ADDR and VAULT_TOKEN.", code: "vaultNotConfigured" },
      { status: 503 }
    );
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return invalidInput(parsed.error);
  const { path } = parsed.data;

  const result = await listVaultSecretKeys(path);
  // The path is user input, not the resource in the URL: a missing secret is invalid input.
  if (result.status === "missing") {
    return NextResponse.json({ error: `No secret found at "${path}".`, code: "vaultSecretMissing" }, { status: 400 });
  }
  if (result.status === "denied") {
    return NextResponse.json({ error: `Vault refused access to "${path}". Check the token's policy.`, code: "vaultDenied" }, { status: 502 });
  }
  if (result.status === "unavailable") {
    return NextResponse.json({ error: "Vault could not be reached, or the login failed.", code: "vaultUnavailable" }, { status: 502 });
  }
  const keys = result.value;

  return NextResponse.json({
    ok: true,
    path,
    keys,
    message: `Found ${keys.length} key${keys.length !== 1 ? "s" : ""}: ${keys.join(", ")}`,
  });
}
