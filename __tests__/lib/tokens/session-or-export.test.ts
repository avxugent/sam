import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/two-factor/sign-in-steps", () => ({ signInIncompleteResponse: vi.fn() }));

import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";

const req = (token?: string) => new Request("http://x", { headers: token ? { authorization: `Bearer ${token}` } : {} });
const ORIGINAL = process.env.EXPORT_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EXPORT_TOKEN = "tok";
  vi.mocked(signInIncompleteResponse).mockResolvedValue(null);
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPORT_TOKEN;
  else process.env.EXPORT_TOKEN = ORIGINAL;
});

describe("adminSessionOrExportToken()", () => {
  it("accepts a valid export token without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await adminSessionOrExportToken(req("tok"))).toEqual({ session: null });
  });

  it("401 without a session or with a wrong token", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await adminSessionOrExportToken(req("nope"))).response?.status).toBe(401);
  });

  it("403 for a non-admin, and the sign-in step response for a partial session", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "EDITOR" } } as never);
    expect((await adminSessionOrExportToken(req())).response?.status).toBe(403);
    vi.mocked(signInIncompleteResponse).mockResolvedValue(NextResponse.json({}, { status: 403 }));
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" }, needs2FA: true } as never);
    expect((await adminSessionOrExportToken(req())).response?.status).toBe(403);
  });

  it("returns the admin session", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    vi.mocked(auth).mockResolvedValue(session as never);
    expect(await adminSessionOrExportToken(req())).toEqual({ session });
  });
});
