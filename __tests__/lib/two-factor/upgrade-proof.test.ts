// @vitest-environment node
// jose's Uint8Array instanceof checks fail across jsdom/Node realm boundaries.
import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { signUpgradeProof, verifyUpgradeProof } from "@/lib/two-factor/upgrade-proof";
import { signRememberMeToken } from "@/lib/two-factor/remember-device";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-bytes-long-0000";
});

describe("upgrade proof", () => {
  it("verifies a proof signed for the same user", async () => {
    const proof = await signUpgradeProof("user-1");
    expect(await verifyUpgradeProof(proof, "user-1")).toBe(true);
  });

  it("rejects a proof issued for a different user", async () => {
    const proof = await signUpgradeProof("user-1");
    expect(await verifyUpgradeProof(proof, "user-2")).toBe(false);
  });

  it("rejects a missing or non-string proof (a bare userId is never enough)", async () => {
    expect(await verifyUpgradeProof(undefined, "user-1")).toBe(false);
    expect(await verifyUpgradeProof("", "user-1")).toBe(false);
    expect(await verifyUpgradeProof(42, "user-1")).toBe(false);
    expect(await verifyUpgradeProof("not-a-jwt", "user-1")).toBe(false);
  });

  it("rejects a remember-me token for the same user (different audience)", async () => {
    const rememberMe = await signRememberMeToken("user-1");
    expect(await verifyUpgradeProof(rememberMe, "user-1")).toBe(false);
  });

  it("rejects an expired proof", async () => {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("sam-2fa-upgrade")
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(secret);
    expect(await verifyUpgradeProof(expired, "user-1")).toBe(false);
  });

  it("rejects a proof signed with another secret", async () => {
    const proof = await signUpgradeProof("user-1");
    process.env.NEXTAUTH_SECRET = "a-completely-different-secret-value-1234";
    expect(await verifyUpgradeProof(proof, "user-1")).toBe(false);
  });
});
