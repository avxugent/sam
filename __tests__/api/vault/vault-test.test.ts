import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/integrations/vault", () => ({ isVaultConfigured: vi.fn(), listVaultSecretKeys: vi.fn() }));

import { auth } from "@/lib/auth";
import { isVaultConfigured, listVaultSecretKeys } from "@/lib/integrations/vault";
import { GET } from "@/app/api/vault/test/route";

const get = (query = "?path=secret/av/rec01") => GET(new NextRequest(`http://localhost/api/vault/test${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "EDITOR" } } as never);
  vi.mocked(isVaultConfigured).mockReturnValue(true);
});

describe("GET /api/vault/test", () => {
  it("401 without a session, 403 for a viewer", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await get()).status).toBe(401);
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    expect((await get()).status).toBe(403);
  });

  it("503 when Vault is not configured", async () => {
    vi.mocked(isVaultConfigured).mockReturnValue(false);
    expect((await get()).status).toBe(503);
  });

  it("400 without a path", async () => {
    expect((await get("?path=%20")).status).toBe(400);
    expect(listVaultSecretKeys).not.toHaveBeenCalled();
  });

  it("404 when the secret cannot be read", async () => {
    vi.mocked(listVaultSecretKeys).mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBe(false);
  });

  it("returns the key names only, never values", async () => {
    vi.mocked(listVaultSecretKeys).mockResolvedValue(["username", "password"]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      path: "secret/av/rec01",
      keys: ["username", "password"],
      message: "Found 2 keys: username, password",
    });
    expect(listVaultSecretKeys).toHaveBeenCalledWith("secret/av/rec01");
  });
});
