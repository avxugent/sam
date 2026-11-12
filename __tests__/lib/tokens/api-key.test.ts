import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { apiKeyUser, generateApiKey, hashApiKey } from "@/lib/tokens/api-key";

const findUnique = vi.mocked(prisma.apiKey.findUnique);
const update = vi.mocked(prisma.apiKey.update);

const user = { id: "u1", name: "T", role: "VIEWER" };
function reqWith(authorization?: string) {
  return new Request("http://localhost/api/mcp", { headers: authorization ? { authorization } : {} });
}

beforeEach(() => vi.clearAllMocks());

describe("generateApiKey", () => {
  it("returns a prefixed key, its display prefix and the hash of the full key", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^sam_mcp_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key);
  });

  it("generates a different key each time", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("apiKeyUser", () => {
  it.each([
    ["no header", undefined],
    ["wrong scheme", "Basic abc"],
    ["not a SAM key", "Bearer something-else"],
  ])("401 for %s without querying the database", async (_name, header) => {
    const result = await apiKeyUser(reqWith(header));
    expect("error" in result && result.error.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("401 with WWW-Authenticate for an unknown key", async () => {
    findUnique.mockResolvedValue(null);
    const result = await apiKeyUser(reqWith("Bearer sam_mcp_unknown"));
    expect("error" in result && result.error.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("401 for an expired key", async () => {
    findUnique.mockResolvedValue({ id: "k1", expiresAt: new Date(Date.now() - 1000), lastUsedAt: null, user } as never);
    const result = await apiKeyUser(reqWith("Bearer sam_mcp_x"));
    expect("error" in result).toBe(true);
  });

  it("looks the key up by hash and returns its owner", async () => {
    findUnique.mockResolvedValue({ id: "k1", expiresAt: null, lastUsedAt: new Date(), user } as never);
    const result = await apiKeyUser(reqWith("Bearer sam_mcp_abc"));
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashApiKey("sam_mcp_abc") } }));
    expect(result).toEqual({ user, keyId: "k1" });
  });

  it("records first use and uses older than a minute, but not recent ones", async () => {
    findUnique.mockResolvedValue({ id: "k1", expiresAt: null, lastUsedAt: null, user } as never);
    await apiKeyUser(reqWith("Bearer sam_mcp_abc"));
    expect(update).toHaveBeenCalledTimes(1);

    findUnique.mockResolvedValue({ id: "k1", expiresAt: null, lastUsedAt: new Date(Date.now() - 5 * 60_000), user } as never);
    await apiKeyUser(reqWith("Bearer sam_mcp_abc"));
    expect(update).toHaveBeenCalledTimes(2);

    findUnique.mockResolvedValue({ id: "k1", expiresAt: null, lastUsedAt: new Date(Date.now() - 1000), user } as never);
    await apiKeyUser(reqWith("Bearer sam_mcp_abc"));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
