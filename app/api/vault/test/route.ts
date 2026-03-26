/**
 * GET /api/vault/test?path=<vaultPath>
 *
 * Tests a Vault KV secret path and returns the key names (NOT values)
 * so the user can verify their configuration without exposing secrets
 * in the browser or network logs.
 *
 * Authentication: standard NextAuth session (Admin or Editor only).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isVaultConfigured, listVaultSecretKeys } from "@/lib/vault";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isVaultConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Vault is not configured on this server. Set VAULT_ADDR and VAULT_TOKEN.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path")?.trim();

  if (!path) {
    return NextResponse.json(
      { error: "Missing required query parameter: path" },
      { status: 400 }
    );
  }

  const keys = await listVaultSecretKeys(path);

  if (keys === null) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not read secret at "${path}". Check the path and token permissions.`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    keys,
    message: `Found ${keys.length} key${keys.length !== 1 ? "s" : ""}: ${keys.join(", ")}`,
  });
}
