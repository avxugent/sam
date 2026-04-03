import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isVaultConfigured, readVaultSecret, listVaultSecretKeys } from "@/lib/vault";

// Store original env values
const ORIGINAL_ADDR = process.env.VAULT_ADDR;
const ORIGINAL_TOKEN = process.env.VAULT_TOKEN;
const ORIGINAL_VERSION = process.env.VAULT_KV_VERSION;

function setVaultEnv(addr?: string, token?: string, version?: string) {
  if (addr !== undefined) process.env.VAULT_ADDR = addr;
  else delete process.env.VAULT_ADDR;
  if (token !== undefined) process.env.VAULT_TOKEN = token;
  else delete process.env.VAULT_TOKEN;
  if (version !== undefined) process.env.VAULT_KV_VERSION = version;
  else delete process.env.VAULT_KV_VERSION;
}

afterEach(() => {
  setVaultEnv(ORIGINAL_ADDR, ORIGINAL_TOKEN, ORIGINAL_VERSION);
  vi.restoreAllMocks();
});

// ── isVaultConfigured ────────────────────────────────────────────────────────

describe("isVaultConfigured()", () => {
  it("returns false when neither env var is set", () => {
    setVaultEnv(undefined, undefined);
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns false when only VAULT_ADDR is set", () => {
    setVaultEnv("https://vault.example.com", undefined);
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns false when only VAULT_TOKEN is set", () => {
    setVaultEnv(undefined, "s.token");
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns true when both are set", () => {
    setVaultEnv("https://vault.example.com", "s.token");
    expect(isVaultConfigured()).toBe(true);
  });
});

// ── readVaultSecret ──────────────────────────────────────────────────────────

describe("readVaultSecret()", () => {
  beforeEach(() => {
    setVaultEnv("https://vault.example.com", "s.testtoken", "v2");
  });

  it("returns null when vault is not configured", async () => {
    setVaultEnv(undefined, undefined);
    const result = await readVaultSecret("secret/av/device1");
    expect(result).toBeNull();
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
    expect(result).toEqual({ username: "admin", password: "hunter2" });

    // Verify the URL was constructed correctly for KV v2 (inserts "data/")
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("/v1/secret/data/av/device1");
    // Verify token header
    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
    expect(headers["X-Vault-Token"]).toBe("s.testtoken");
  });

  it("reads KV v1 secrets without inserting 'data/' segment", async () => {
    setVaultEnv("https://vault.example.com", "s.testtoken", "v1");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { username: "admin" } }),
    } as Response);

    const result = await readVaultSecret("secret/av/device1");
    expect(result).toEqual({ username: "admin" });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Must NOT contain double "data"
    expect(url).not.toContain("/data/data/");
    expect(url).toContain("/v1/secret/av/device1");
  });

  it("returns null on 404 (secret not found)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await readVaultSecret("secret/missing");
    expect(result).toBeNull();
  });

  it("returns null on 403 (permission denied)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);
    const result = await readVaultSecret("secret/forbidden");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const result = await readVaultSecret("secret/device");
    expect(result).toBeNull();
  });
});

// ── listVaultSecretKeys ──────────────────────────────────────────────────────

describe("listVaultSecretKeys()", () => {
  beforeEach(() => {
    setVaultEnv("https://vault.example.com", "s.token", "v2");
  });

  it("returns key names without values", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { data: { username: "admin", password: "secret" } },
      }),
    } as Response);

    const keys = await listVaultSecretKeys("secret/device");
    expect(keys).toContain("username");
    expect(keys).toContain("password");
    expect(keys).toHaveLength(2);
  });

  it("returns null when the secret does not exist", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);
    const keys = await listVaultSecretKeys("secret/missing");
    expect(keys).toBeNull();
  });
});
