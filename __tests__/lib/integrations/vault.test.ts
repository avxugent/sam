import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isVaultConfigured, readVaultSecret, listVaultSecretKeys, tokenExpiresAt, _clearVaultTokenCacheForTest } from "@/lib/integrations/vault";

// Store original env values
const ORIGINAL_ADDR = process.env.VAULT_ADDR;
const ORIGINAL_TOKEN = process.env.VAULT_TOKEN;
const ORIGINAL_VERSION = process.env.VAULT_KV_VERSION;
const ORIGINAL_ROLE_ID = process.env.VAULT_ROLE_ID;
const ORIGINAL_SECRET_ID = process.env.VAULT_SECRET_ID;
const ORIGINAL_APPROLE_MOUNT = process.env.VAULT_APPROLE_MOUNT;

function setVaultEnv(opts: {
  addr?: string;
  token?: string;
  version?: string;
  roleId?: string;
  secretId?: string;
  approleMount?: string;
}) {
  const set = (key: string, val?: string) => {
    if (val !== undefined) process.env[key] = val;
    else delete process.env[key];
  };
  set("VAULT_ADDR", opts.addr);
  set("VAULT_TOKEN", opts.token);
  set("VAULT_KV_VERSION", opts.version);
  set("VAULT_ROLE_ID", opts.roleId);
  set("VAULT_SECRET_ID", opts.secretId);
  set("VAULT_APPROLE_MOUNT", opts.approleMount);
}

afterEach(() => {
  setVaultEnv({
    addr: ORIGINAL_ADDR,
    token: ORIGINAL_TOKEN,
    version: ORIGINAL_VERSION,
    roleId: ORIGINAL_ROLE_ID,
    secretId: ORIGINAL_SECRET_ID,
    approleMount: ORIGINAL_APPROLE_MOUNT,
  });
  vi.restoreAllMocks();
});

// ── isVaultConfigured ────────────────────────────────────────────────────────

describe("isVaultConfigured()", () => {
  it("returns false when no env vars are set", () => {
    setVaultEnv({});
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns false when only VAULT_ADDR is set", () => {
    setVaultEnv({ addr: "https://vault.example.com" });
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns false when only VAULT_TOKEN is set", () => {
    setVaultEnv({ token: "s.token" });
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns true when VAULT_ADDR + VAULT_TOKEN are set (token auth)", () => {
    setVaultEnv({ addr: "https://vault.example.com", token: "s.token" });
    expect(isVaultConfigured()).toBe(true);
  });

  it("returns false when VAULT_ADDR + VAULT_ROLE_ID are set but VAULT_SECRET_ID is missing", () => {
    setVaultEnv({ addr: "https://vault.example.com", roleId: "my-role-id" });
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns false when VAULT_ADDR + VAULT_SECRET_ID are set but VAULT_ROLE_ID is missing", () => {
    setVaultEnv({ addr: "https://vault.example.com", secretId: "my-secret-id" });
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns true when VAULT_ADDR + VAULT_ROLE_ID + VAULT_SECRET_ID are set (AppRole auth)", () => {
    setVaultEnv({
      addr: "https://vault.example.com",
      roleId: "my-role-id",
      secretId: "my-secret-id",
    });
    expect(isVaultConfigured()).toBe(true);
  });
});

// ── readVaultSecret — token auth ─────────────────────────────────────────────

describe("readVaultSecret() — token auth", () => {
  beforeEach(() => {
    setVaultEnv({ addr: "https://vault.example.com", token: "s.testtoken", version: "v2" });
  });

  it("is unavailable when vault is not configured", async () => {
    setVaultEnv({});
    const result = await readVaultSecret("secret/av/device1");
    expect(result).toEqual({ status: "unavailable" });
  });

  it("reads KV v2 secrets and returns the inner data map", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          data: { username: "admin", password: "hunter2" },
        },
      }),
    } as Response);

    const result = await readVaultSecret("secret/av/device1");
    expect(result).toEqual({ status: "found", value: { username: "admin", password: "hunter2" } });

    // Verify the URL was constructed correctly for KV v2 (inserts "data/")
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("/v1/secret/data/av/device1");
    // Verify token header
    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
    expect(headers["X-Vault-Token"]).toBe("s.testtoken");
  });

  it("reads KV v1 secrets without inserting 'data/' segment", async () => {
    setVaultEnv({ addr: "https://vault.example.com", token: "s.testtoken", version: "v1" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { username: "admin" } }),
    } as Response);

    const result = await readVaultSecret("secret/av/device1");
    expect(result).toEqual({ status: "found", value: { username: "admin" } });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).not.toContain("/data/data/");
    expect(url).toContain("/v1/secret/av/device1");
  });

  it("reports a 404 as missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await readVaultSecret("secret/missing");
    expect(result).toEqual({ status: "missing" });
  });

  it("reports a 403 as denied", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);
    const result = await readVaultSecret("secret/forbidden");
    expect(result).toEqual({ status: "denied" });
  });

  it("reports a network error as unavailable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const result = await readVaultSecret("secret/device");
    expect(result).toEqual({ status: "unavailable" });
  });
});

// ── readVaultSecret — AppRole auth ───────────────────────────────────────────

describe("readVaultSecret() — AppRole auth", () => {
  const LOGIN_RESPONSE = {
    auth: { client_token: "s.approle-token", lease_duration: 3600 },
  };
  const SECRET_RESPONSE = {
    data: { data: { username: "admin", password: "s3cr3t" } },
  };

  beforeEach(() => {
    setVaultEnv({
      addr: "https://vault.example.com",
      roleId: "test-role-id",
      secretId: "test-secret-id",
      version: "v2",
    });
    _clearVaultTokenCacheForTest();
  });

  it("reuses the cached token for the next read", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => LOGIN_RESPONSE } as Response)
      .mockResolvedValue({ ok: true, json: async () => SECRET_RESPONSE } as Response);
    await readVaultSecret("secret/av/device1");
    await readVaultSecret("secret/av/device2");
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(urls.filter((u: string) => u.includes("/auth/approle/login"))).toHaveLength(1);
    expect(urls).toHaveLength(3);
  });

  it("bounds the login and the read with a timeout", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => LOGIN_RESPONSE } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => SECRET_RESPONSE } as Response);
    await readVaultSecret("secret/av/device1");
    for (const [, init] of (global.fetch as ReturnType<typeof vi.fn>).mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("logs in via AppRole and uses the returned token to read a secret", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => LOGIN_RESPONSE,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => SECRET_RESPONSE,
      } as Response);

    const result = await readVaultSecret("secret/av/device1");
    expect(result).toEqual({ status: "found", value: { username: "admin", password: "s3cr3t" } });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    // First call must be the AppRole login
    expect(calls[0][0]).toContain("/v1/auth/approle/login");
    expect(calls[0][1].method).toBe("POST");
    expect(JSON.parse(calls[0][1].body)).toEqual({
      role_id: "test-role-id",
      secret_id: "test-secret-id",
    });
    // Second call must use the token from the login response
    expect(calls[1][1].headers["X-Vault-Token"]).toBe("s.approle-token");
  });

  it("uses a custom VAULT_APPROLE_MOUNT path", async () => {
    setVaultEnv({
      addr: "https://vault.example.com",
      roleId: "r",
      secretId: "s",
      approleMount: "custom-approle",
      version: "v2",
    });

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => LOGIN_RESPONSE,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => SECRET_RESPONSE,
      } as Response);

    await readVaultSecret("secret/device");

    const loginUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loginUrl).toContain("/v1/auth/custom-approle/login");
  });

  it("is unavailable when AppRole login fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as Response);

    const result = await readVaultSecret("secret/device");
    expect(result).toEqual({ status: "unavailable" });
  });

  it("is unavailable when AppRole login response contains no client_token", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth: {} }),
    } as Response);

    const result = await readVaultSecret("secret/device");
    expect(result).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the AppRole login fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const result = await readVaultSecret("secret/device");
    expect(result).toEqual({ status: "unavailable" });
  });

  it("prefers AppRole over VAULT_TOKEN when both are set", async () => {
    setVaultEnv({
      addr: "https://vault.example.com",
      token: "s.static-token",
      roleId: "test-role-id",
      secretId: "test-secret-id",
      version: "v2",
    });

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => LOGIN_RESPONSE,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => SECRET_RESPONSE,
      } as Response);

    await readVaultSecret("secret/device");

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    // Must have performed the AppRole login, not used the static token directly
    expect(calls[0][0]).toContain("/v1/auth/approle/login");
    // The secret read must use the AppRole token, not the static one
    expect(calls[1][1].headers["X-Vault-Token"]).toBe("s.approle-token");
  });
});

// ── listVaultSecretKeys ──────────────────────────────────────────────────────

describe("listVaultSecretKeys()", () => {
  beforeEach(() => {
    setVaultEnv({ addr: "https://vault.example.com", token: "s.token", version: "v2" });
  });

  it("returns key names without values", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { data: { username: "admin", password: "secret" } },
      }),
    } as Response);

    const keys = await listVaultSecretKeys("secret/device");
    expect(keys).toEqual({ status: "found", value: ["username", "password"] });
  });

  it("reports a secret that does not exist as missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);
    const keys = await listVaultSecretKeys("secret/missing");
    expect(keys).toEqual({ status: "missing" });
  });
});

describe("tokenExpiresAt()", () => {
  it("renews 60 s before a normal TTL expires", () => {
    expect(tokenExpiresAt(3600, 0)).toBe(3540_000);
  });
  it("renews at half-life when the TTL is shorter than twice the buffer", () => {
    expect(tokenExpiresAt(30, 0)).toBe(15_000);
  });
  it("never expires a token with lease_duration 0", () => {
    expect(tokenExpiresAt(0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
