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

// ── Internal AppRole token cache ─────────────────────────────────────────────

type CachedToken = {
  token: string;
  /** Unix timestamp (ms) after which the token should no longer be used */
  expiresAt: number;
  /** Credentials used to obtain this token — used to detect rotation */
  roleId: string;
  secretId: string;
};

let _tokenCache: CachedToken | null = null;

/** How many seconds before the Vault TTL expires we proactively re-authenticate */
const EXPIRY_BUFFER_S = 60;

// ── Auth method detection ─────────────────────────────────────────────────────

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

/** Returns true when Vault is configured via either auth method */
export function isVaultConfigured(): boolean {
  return isApproleAuth() || isTokenAuth();
}

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Authenticates with Vault using the AppRole method and caches the returned
 * client token. Returns null if authentication fails.
 */
async function loginWithApprole(): Promise<string | null> {
  const addr = process.env.VAULT_ADDR!.replace(/\/$/, "");
  const roleId = process.env.VAULT_ROLE_ID!;
  const secretId = process.env.VAULT_SECRET_ID!;
  const mount = (process.env.VAULT_APPROLE_MOUNT ?? "approle").replace(/^\/|\/$/g, "");

  const url = `${addr}/v1/auth/${mount}/login`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
      cache: "no-store",
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
      expiresAt: Date.now() + (ttl - EXPIRY_BUFFER_S) * 1000,
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
 * Returns a valid Vault token, using whichever auth method is configured.
 * AppRole takes precedence when both are set; the resulting token is cached
 * and refreshed automatically when it nears expiry.
 */
async function getVaultToken(): Promise<string | null> {
  // AppRole takes precedence
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

  // Fall back to static token
  if (isTokenAuth()) {
    return process.env.VAULT_TOKEN!;
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

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
  const version = (process.env.VAULT_KV_VERSION ?? "v2").toLowerCase();

  const token = await getVaultToken();
  if (!token) return null;

  // For KV v2, inject "data/" into the path after the mount point.
  // We do this by splitting on the first "/":
  //   "secret/av/rectest001" → "secret/data/av/rectest001"
  let apiPath: string;
  if (version === "v2") {
    const slashIdx = path.indexOf("/");
    if (slashIdx === -1) {
      apiPath = path; // bare mount — unusual but pass through
    } else {
      apiPath = path.slice(0, slashIdx) + "/data" + path.slice(slashIdx);
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
        // Invalidate the AppRole token cache so the next call re-authenticates
        _tokenCache = null;
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
