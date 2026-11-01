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

  it("503 with a code when Vault is not configured", async () => {
    vi.mocked(isVaultConfigured).mockReturnValue(false);
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: expect.any(String), code: "vaultNotConfigured" });
  });

  it("400 without a path, or with an over-long one", async () => {
    expect((await get("?path=%20")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    const res = await get(`?path=${"a".repeat(501)}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
    expect(listVaultSecretKeys).not.toHaveBeenCalled();
  });

  it.each([
    ["denied", 502, "vaultDenied"],
    ["unavailable", 502, "vaultUnavailable"],
  ] as const)("reports a %s read as %i %s", async (status, httpStatus, code) => {
    vi.mocked(listVaultSecretKeys).mockResolvedValue({ status });
    const res = await get("?path=secret/av/rec01");
    expect(res.status).toBe(httpStatus);
    expect((await res.json()).code).toBe(code);
  });

  it("400 with a code when no secret exists at the path", async () => {
    vi.mocked(listVaultSecretKeys).mockResolvedValue({ status: "missing" });
    const res = await get();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("vaultSecretMissing");
    expect(body).not.toHaveProperty("ok");
  });

  it("returns the key names only, never values", async () => {
    vi.mocked(listVaultSecretKeys).mockResolvedValue({ status: "found", value: ["username", "password"] });
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
