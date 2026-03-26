/**
 * HashiCorp Vault KV client — zero external dependencies.
 * Uses the native fetch API and the Vault HTTP API directly.
 *
 * Supports KV v1 and KV v2 (configured via VAULT_KV_VERSION env var).
 * Authenticates with a static token (VAULT_TOKEN env var).
 *
 * Environment variables:
 *   VAULT_ADDR        — e.g. https://vault.example.com   (required to enable)
 *   VAULT_TOKEN       — static token with read access     (required to enable)
 *   VAULT_KV_VERSION  — "v1" or "v2" (default: "v2")
 */

type VaultSecretData = Record<string, string>;

/** Returns true when all required Vault env vars are set */
export function isVaultConfigured(): boolean {
  return !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
}

/**
 * Reads a KV secret from Vault and returns a map of key → value.
 *
 * For KV v2 the path should NOT include the "data/" segment —
 * this function inserts it automatically.
 * e.g. pass "secret/av/rectest001", not "secret/data/av/rectest001".
 *
 * Returns null on any error (connection failure, 404, wrong token, etc.)
 * so that callers can degrade gracefully.
 */
export async function readVaultSecret(
  path: string
): Promise<VaultSecretData | null> {
  if (!isVaultConfigured()) return null;

  const addr = process.env.VAULT_ADDR!.replace(/\/$/, "");
  const token = process.env.VAULT_TOKEN!;
  const version = (process.env.VAULT_KV_VERSION ?? "v2").toLowerCase();

  // For KV v2, inject "data/" into the path after the mount point.
  // We do this by splitting on the first "/":
  //   "secret/av/rectest001" → "secret/data/av/rectest001"
  let apiPath: string;
  if (version === "v2") {
    const slashIdx = path.indexOf("/");
    if (slashIdx === -1) {
      apiPath = path; // bare mount — unusual but pass through
    } else {
      apiPath =
        path.slice(0, slashIdx) + "/data" + path.slice(slashIdx);
    }
  } else {
    apiPath = path;
  }

  const url = `${addr}/v1/${apiPath}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vault-Token": token,
        "Content-Type": "application/json",
      },
      // Prevent Next.js from caching Vault responses — secrets can change
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[vault] Secret not found at path: ${path}`);
      } else if (res.status === 403) {
        console.warn(`[vault] Access denied for path: ${path}`);
      } else {
        console.warn(`[vault] HTTP ${res.status} reading path: ${path}`);
      }
      return null;
    }

    const body = await res.json() as {
      data?: VaultSecretData | { data?: VaultSecretData };
    };

    // KV v2 wraps the data: { data: { data: { key: val } } }
    // KV v1 has: { data: { key: val } }
    if (version === "v2") {
      const inner = (body.data as { data?: VaultSecretData } | undefined)?.data;
      return inner ?? null;
    } else {
      return (body.data as VaultSecretData | undefined) ?? null;
    }
  } catch (err) {
    console.warn(`[vault] Failed to read secret at path "${path}":`, err);
    return null;
  }
}

/**
 * Returns the key names (not values) of a Vault secret.
 * Used by the UI "Test" button to verify a path is correct without
 * exposing secret values.
 */
export async function listVaultSecretKeys(
  path: string
): Promise<string[] | null> {
  const secret = await readVaultSecret(path);
  if (!secret) return null;
  return Object.keys(secret);
}
