import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";

const req = (token?: string) => new Request("http://x", { headers: token ? { authorization: `Bearer ${token}` } : {} });
const ORIGINAL = process.env.EXPORT_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EXPORT_TOKEN = "tok";
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPORT_TOKEN;
  else process.env.EXPORT_TOKEN = ORIGINAL;
});

/** The status of the error response a check returned, or null when it let the request through. */
const errorStatus = (result: Awaited<ReturnType<typeof adminSessionOrExportToken>>) => ("error" in result ? result.error.status : null);

describe("adminSessionOrExportToken()", () => {
  it("accepts a valid export token without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await adminSessionOrExportToken(req("tok"))).toEqual({ session: null });
  });

  it("401 without a session or with a wrong token", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(errorStatus(await adminSessionOrExportToken(req("nope")))).toBe(401);
  });

  it("403 for a non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "EDITOR" } } as never);
    expect(errorStatus(await adminSessionOrExportToken(req()))).toBe(403);
  });

  it("returns the admin session", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    vi.mocked(auth).mockResolvedValue(session as never);
    expect(await adminSessionOrExportToken(req())).toEqual({ session });
  });
});
