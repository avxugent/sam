import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passkey: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => {
  // One mock for both reads: auth() and the login-step routes' authIncludingPendingSteps().
  const read = vi.fn();
  return { auth: read, authIncludingPendingSteps: read };
});
vi.mock("@/lib/two-factor/webauthn", () => ({
  buildRegistrationOptions: vi.fn(),
  setChallengeCookie: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildRegistrationOptions, setChallengeCookie } from "@/lib/two-factor/webauthn";
import { POST } from "@/app/api/auth/passkey/registration-options/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockFindMany = vi.mocked(prisma.passkey.findMany);
const mockBuildOptions = vi.mocked(buildRegistrationOptions);
const mockSetChallenge = vi.mocked(setChallengeCookie);

function session() {
  return { user: { id: "u1", email: "a@b.com", role: "EDITOR" } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockBuildOptions.mockResolvedValue({ challenge: "chal" } as never);
});

describe("POST /api/auth/passkey/registration-options", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 400 for SSO accounts", async () => {
    mockAuth.mockResolvedValue(session());
    mockFindUnique.mockResolvedValue({ id: "u1", provider: "microsoft-entra-id", email: "a@b.com", name: "A" } as never);
    const res = await POST();
    expect(res.status).toBe(400);
  });

  it("returns options and sets the challenge cookie for credentials users", async () => {
    mockAuth.mockResolvedValue(session());
    mockFindUnique.mockResolvedValue({ id: "u1", provider: "credentials", email: "a@b.com", name: "Alice" } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toEqual({ challenge: "chal" });
    expect(mockSetChallenge).toHaveBeenCalledWith(expect.anything(), "u1", "registration", "chal");
  });
});
