import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/two-factor/sign-in-steps", () => ({ signInIncompleteResponse: vi.fn() }));
vi.mock("@/lib/tokens/integration", () => ({ integrationTokenError: vi.fn() }));

import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { integrationTokenError } from "@/lib/tokens/integration";
import { sessionOrIntegrationTokenError } from "@/lib/tokens/session-or-integration";

const req = new Request("http://x");
const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const isAdmin = (role: string) => role === "ADMIN";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(signInIncompleteResponse).mockResolvedValue(null);
  vi.mocked(integrationTokenError).mockReturnValue(unauthorized);
});

describe("sessionOrIntegrationTokenError()", () => {
  it("lets a fully signed-in session with an allowed role through without a token", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    expect(await sessionOrIntegrationTokenError(req, isAdmin as never)).toBeNull();
    expect(integrationTokenError).not.toHaveBeenCalled();
  });

  it("falls back to the token check for a role that is not allowed", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    expect(await sessionOrIntegrationTokenError(req, isAdmin as never)).toBe(unauthorized);
  });

  it("falls back to the token check for a partly signed-in session", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" }, needs2FA: true } as never);
    vi.mocked(signInIncompleteResponse).mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect(await sessionOrIntegrationTokenError(req, isAdmin as never)).toBe(unauthorized);
  });

  it("returns null when there is no session but the token is valid", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(integrationTokenError).mockReturnValue(null);
    expect(await sessionOrIntegrationTokenError(req, isAdmin as never)).toBeNull();
  });
});
