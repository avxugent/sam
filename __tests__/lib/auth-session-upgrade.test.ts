import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/two-factor/upgrade-proof", () => ({ signUpgradeProof: vi.fn() }));

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { signUpgradeProof } from "@/lib/two-factor/upgrade-proof";
import { upgradeSession } from "@/lib/auth-session-upgrade";

const mockSignIn = vi.mocked(signIn);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(signUpgradeProof).mockResolvedValue("signed-proof");
});

describe("upgradeSession", () => {
  it("signs in through the upgrade provider with a signed proof", async () => {
    mockSignIn.mockResolvedValue("http://localhost/" as never);
    expect(await upgradeSession("u1", "totp")).toBe(true);
    expect(signUpgradeProof).toHaveBeenCalledWith("u1");
    expect(mockSignIn).toHaveBeenCalledWith("credentials-2fa-verified", {
      userId: "u1",
      method: "totp",
      proof: "signed-proof",
      redirect: false,
    });
  });

  it("returns false when the provider refuses the sign-in", async () => {
    mockSignIn.mockRejectedValue(new AuthError("CredentialsSignin"));
    expect(await upgradeSession("u1", "passkey")).toBe(false);
  });

  it("rethrows errors that are not auth failures", async () => {
    mockSignIn.mockRejectedValue(new Error("database down"));
    await expect(upgradeSession("u1", "totp")).rejects.toThrow("database down");
  });
});
