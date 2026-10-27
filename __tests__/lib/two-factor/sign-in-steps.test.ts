import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/two-factor/remember-device", () => ({
  REMEMBER_ME_COOKIE: "sam_2fa_rm",
  verifyRememberMeToken: vi.fn(),
}));

import { cookies } from "next/headers";
import { verifyRememberMeToken } from "@/lib/two-factor/remember-device";
import { pendingSignInStep, signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";

const mockVerifyRememberMe = vi.mocked(verifyRememberMeToken);
const mockCookies = vi.mocked(cookies);

function session(flags: object = {}) {
  return { user: { id: "u1", role: "VIEWER" }, expires: "", ...flags } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyRememberMe.mockResolvedValue(false);
  mockCookies.mockResolvedValue({ get: () => ({ value: "rm-token" }) } as never);
});

describe("pendingSignInStep", () => {
  it("is null for a fully signed-in session", async () => {
    expect(await pendingSignInStep(session(), undefined)).toBeNull();
  });

  it("reports a forced password change first, then forced 2FA setup", async () => {
    expect(await pendingSignInStep(session({ needsPasswordChange: true, needs2FA: true }), undefined)).toBe("password-change");
    expect(await pendingSignInStep(session({ needs2FASetup: true }), undefined)).toBe("2fa-setup");
  });

  it("reports a pending second factor unless the device is remembered for this user", async () => {
    expect(await pendingSignInStep(session({ needs2FA: true }), "rm-token")).toBe("2fa");
    mockVerifyRememberMe.mockResolvedValue(true);
    expect(await pendingSignInStep(session({ needs2FA: true }), "rm-token")).toBeNull();
    expect(mockVerifyRememberMe).toHaveBeenCalledWith("rm-token", "u1");
  });
});

describe("signInIncompleteResponse", () => {
  it("passes a fully signed-in session without reading cookies", async () => {
    expect(await signInIncompleteResponse(session())).toBeNull();
    expect(mockCookies).not.toHaveBeenCalled();
  });

  it("answers 403 while a second factor is pending", async () => {
    const res = await signInIncompleteResponse(session({ needs2FA: true }));
    expect(res?.status).toBe(403);
  });

  it("passes a pending second factor on a remembered device", async () => {
    mockVerifyRememberMe.mockResolvedValue(true);
    expect(await signInIncompleteResponse(session({ needs2FA: true }))).toBeNull();
  });

  it("passes only the steps listed in `allowed`", async () => {
    expect(await signInIncompleteResponse(session({ needs2FASetup: true }), ["2fa-setup"])).toBeNull();
    expect((await signInIncompleteResponse(session({ needs2FASetup: true })))?.status).toBe(403);
    expect((await signInIncompleteResponse(session({ needsPasswordChange: true }), ["2fa-setup"]))?.status).toBe(403);
  });
});
