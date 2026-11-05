/**
 * HashiCorp Vault KV client — zero external dependencies.
 * Uses the native fetch API and the Vault HTTP API directly.
 *
 * Supports KV v1 and KV v2 (configured via VAULT_KV_VERSION env var).
 *
 * Two authentication methods are supported:
 *
 * Token auth (simplest):
 *   VAULT_ADDR        — e.g. https://vault.example.com   (required)
 *   VAULT_TOKEN       — static token with read access     (required)
 *   VAULT_KV_VERSION  — "v1" or "v2" (default: "v2")
 *
 * AppRole auth:
 *   VAULT_ADDR           — e.g. https://vault.example.com  (required)
 *   VAULT_ROLE_ID        — AppRole role_id                  (required)
 *   VAULT_SECRET_ID      — AppRole secret_id                (required)
 *   VAULT_APPROLE_MOUNT  — auth mount path (default: "approle")
 *   VAULT_KV_VERSION     — "v1" or "v2" (default: "v2")
 *
 * When both VAULT_TOKEN and the AppRole vars are present, AppRole takes precedence.
 */

type VaultSecretData = Record<string, string>;

type CachedToken = {
  token: string;
  /** Unix timestamp (ms) after which the token should no longer be used */
  expiresAt: number;
  /** Credentials used to obtain this token — used to detect rotation */
  roleId: string;
  secretId: string;
};

let _tokenCache: CachedToken | null = null;

export function _clearVaultTokenCacheForTest(): void {
  _tokenCache = null;
}

/** A hung Vault must not hang the request: give up and report "unavailable". */
const REQUEST_TIMEOUT_MS = 10_000;

/** How many seconds before the Vault TTL expires we proactively re-authenticate */
const EXPIRY_BUFFER_S = 60;

/**
 * When a cached AppRole token should be renewed. A lease_duration of 0 means
 * the token does not expire (it is still dropped on a 403); a TTL shorter than
 * twice the buffer renews at half-life instead of landing in the past.
 */
export function tokenExpiresAt(ttlSeconds: number, now = Date.now()): number {
  if (ttlSeconds <= 0) return Number.POSITIVE_INFINITY;
  const buffer = Math.min(EXPIRY_BUFFER_S, ttlSeconds / 2);
  return now + (ttlSeconds - buffer) * 1000;
}

function isTokenAuth(): boolean {
  return !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
}

function isApproleAuth(): boolean {
  return !!(
    process.env.VAULT_ADDR &&
    process.env.VAULT_ROLE_ID &&
    process.env.VAULT_SECRET_ID
  );
}

export function isVaultConfigured(): boolean {
  return isApproleAuth() || isTokenAuth();
}

/** VAULT_ADDR without a trailing slash; only call once Vault is configured. */
function vaultAddr(): string {
  return process.env.VAULT_ADDR!.replace(/\/$/, "");
}

/**
 * Authenticates with Vault using the AppRole method and caches the returned
 * client token. Returns null if authentication fails.
 */
async function loginWithApprole(): Promise<string | null> {
  const roleId = process.env.VAULT_ROLE_ID!;
  const secretId = process.env.VAULT_SECRET_ID!;
  const mount = (process.env.VAULT_APPROLE_MOUNT ?? "approle").replace(/^\/|\/$/g, "");

  const url = `${vaultAddr()}/v1/auth/${mount}/login`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[vault] AppRole login failed — HTTP ${res.status}`);
      return null;
    }

    const body = await res.json() as {
      auth?: { client_token?: string; lease_duration?: number };
    };

    const token = body.auth?.client_token;
    const ttl = body.auth?.lease_duration ?? 3600;

    if (!token) {
      console.warn("[vault] AppRole login response contained no client_token");
      return null;
    }

    _tokenCache = {
      token,
      expiresAt: tokenExpiresAt(ttl),
      roleId,
      secretId,
    };

    return token;
  } catch (err) {
    console.warn("[vault] AppRole login request failed:", err);
    return null;
  }
}

/**
 * Returns a valid Vault token, using whichever auth method is configured. An
 * AppRole token is cached and refreshed automatically when it nears expiry.
 */
async function getVaultToken(): Promise<string | null> {
  if (isApproleAuth()) {
    const roleId = process.env.VAULT_ROLE_ID!;
    const secretId = process.env.VAULT_SECRET_ID!;
    if (
      _tokenCache &&
      _tokenCache.expiresAt > Date.now() &&
      _tokenCache.roleId === roleId &&
      _tokenCache.secretId === secretId
    ) {
      return _tokenCache.token;
    }
    // Cache is missing, expired, or credentials rotated — re-authenticate
    return loginWithApprole();
  }

  if (isTokenAuth()) {
    return process.env.VAULT_TOKEN!;
  }

  return null;
}

/**
 * Result of reading a secret. "missing": nothing at that path. "denied": the
 * token may not read it. "unavailable": Vault is not configured, unreachable,
 * or the login failed.
 */
export type VaultRead<T> =
  | { status: "found"; value: T }
  | { status: "missing" }
  | { status: "denied" }
  | { status: "unavailable" };

/**
 * Reads a KV secret from Vault and returns a map of key → value.
 *
 * For KV v2 the path should NOT include the "data/" segment —
 * this function inserts it automatically.
 * e.g. pass "secret/av/rectest001", not "secret/data/av/rectest001".
 *
 * Never throws: a missing secret, a refused token and an unreachable or
 * unconfigured Vault are reported as distinct results.
 */
export async function readVaultSecret(path: string): Promise<VaultRead<VaultSecretData>> {
  if (!isVaultConfigured()) return { status: "unavailable" };

  const kvV2 = (process.env.VAULT_KV_VERSION ?? "v2").toLowerCase() === "v2";

  const token = await getVaultToken();
  if (!token) return { status: "unavailable" };

  // For KV v2, inject "data/" after the mount point (the first segment):
  //   "secret/av/rectest001" → "secret/data/av/rectest001"; a bare mount passes through.
  const slash = path.indexOf("/");
  const apiPath = kvV2 && slash !== -1 ? `${path.slice(0, slash)}/data${path.slice(slash)}` : path;

  const url = `${vaultAddr()}/v1/${apiPath}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Vault-Token": token,
        "Content-Type": "application/json",
      },
      // Prevent Next.js from caching Vault responses — secrets can change
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 404) {
      console.warn(`[vault] Secret not found at path: ${path}`);
      return { status: "missing" };
    }
    if (res.status === 403) {
      console.warn(`[vault] Access denied for path: ${path}`);
      // Invalidate the AppRole token cache so the next call re-authenticates
      _tokenCache = null;
      return { status: "denied" };
    }
    if (!res.ok) {
      console.warn(`[vault] HTTP ${res.status} reading path: ${path}`);
      return { status: "unavailable" };
    }

    const body = await res.json() as {
      data?: VaultSecretData | { data?: VaultSecretData };
    };

    // KV v2 wraps the data: { data: { data: { key: val } } }
    // KV v1 has: { data: { key: val } }
    const data = kvV2
      ? (body.data as { data?: VaultSecretData } | undefined)?.data
      : (body.data as VaultSecretData | undefined);
    // A KV v2 secret whose latest version is deleted answers 200 without data.
    return data ? { status: "found", value: data } : { status: "missing" };
  } catch (err) {
    console.warn(`[vault] Failed to read secret at path "${path}":`, err instanceof Error ? err.message : "unknown error");
    return { status: "unavailable" };
  }
}

/**
 * Returns the key names (not values) of a Vault secret.
 * Used by the UI "Test" button to verify a path is correct without
 * exposing secret values.
 */
export async function listVaultSecretKeys(path: string): Promise<VaultRead<string[]>> {
  const secret = await readVaultSecret(path);
  return secret.status === "found" ? { status: "found", value: Object.keys(secret.value) } : secret;
}
