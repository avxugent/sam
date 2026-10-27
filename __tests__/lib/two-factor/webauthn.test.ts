// @vitest-environment node
// jose's Uint8Array instanceof checks fail across jsdom/Node realm boundaries;
// run this file in the plain Node environment (mirrors __tests__/lib/rate-limit.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

const mockGenerateRegistrationOptions = vi.fn();
const mockVerifyRegistrationResponse = vi.fn();
const mockGenerateAuthenticationOptions = vi.fn();
const mockVerifyAuthenticationResponse = vi.fn();

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: (...args: unknown[]) => mockGenerateRegistrationOptions(...args),
  verifyRegistrationResponse: (...args: unknown[]) => mockVerifyRegistrationResponse(...args),
  generateAuthenticationOptions: (...args: unknown[]) => mockGenerateAuthenticationOptions(...args),
  verifyAuthenticationResponse: (...args: unknown[]) => mockVerifyAuthenticationResponse(...args),
}));

import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import {
  getRpConfig,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
  setChallengeCookie,
  readChallengeCookie,
  clearChallengeCookie,
} from "@/lib/two-factor/webauthn";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-bytes-long-0000";
});

describe("getRpConfig", () => {
  it("derives rpID/origin from NEXTAUTH_URL", () => {
    process.env.NEXTAUTH_URL = "https://sam.example.com";
    expect(getRpConfig()).toEqual({
      rpName: "SAM – Asset Management",
      rpID: "sam.example.com",
      origin: "https://sam.example.com",
    });
  });

  it("strips the port from rpID but keeps it in origin", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const { rpID, origin } = getRpConfig();
    expect(rpID).toBe("localhost");
    expect(origin).toBe("http://localhost:3000");
  });
});

describe("buildRegistrationOptions", () => {
  it("builds exclude credentials from existing passkeys and passes user info through", async () => {
    process.env.NEXTAUTH_URL = "https://sam.example.com";
    mockGenerateRegistrationOptions.mockResolvedValue({ challenge: "chal" });

    const credentialId = isoBase64URL.fromBuffer(new Uint8Array([1, 2, 3]));
    await buildRegistrationOptions(
      { id: "u1", email: "a@b.com", name: "Alice" },
      [{ credentialId, transports: JSON.stringify(["internal"]) }]
    );

    expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpName: "SAM – Asset Management",
        rpID: "sam.example.com",
        userID: isoUint8Array.fromUTF8String("u1"),
        userName: "a@b.com",
        userDisplayName: "Alice",
        attestationType: "none",
        authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
      })
    );
    const call = mockGenerateRegistrationOptions.mock.calls[0][0];
    expect(call.excludeCredentials).toHaveLength(1);
    expect(call.excludeCredentials[0].transports).toEqual(["internal"]);
    expect(call.excludeCredentials[0].id).toBe(credentialId);
  });
});

describe("verifyRegistration", () => {
  it("returns null when the library reports verified: false", async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({ verified: false });
    const result = await verifyRegistration(
      { response: { transports: [] } } as never,
      "challenge"
    );
    expect(result).toBeNull();
  });

  it("normalizes publicKey to base64url, passes the already-encoded credential id through, and captures transports from the response", async () => {
    const credentialId = isoBase64URL.fromBuffer(new Uint8Array([1, 2, 3]));
    const credentialPublicKey = new Uint8Array([4, 5, 6]);
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: credentialId, publicKey: credentialPublicKey, counter: 0 },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });

    const result = await verifyRegistration(
      { response: { transports: ["internal", "hybrid"] } } as never,
      "challenge"
    );

    expect(result).toEqual({
      credentialId,
      publicKey: isoBase64URL.fromBuffer(credentialPublicKey),
      counter: 0,
      transports: JSON.stringify(["internal", "hybrid"]),
      deviceType: "singleDevice",
      backedUp: false,
    });
  });

  it("stores null transports when the browser response omits them", async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: isoBase64URL.fromBuffer(new Uint8Array([1])), publicKey: new Uint8Array([2]), counter: 0 },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });
    const result = await verifyRegistration({ response: {} } as never, "challenge");
    expect(result?.transports).toBeNull();
  });

  it("does not require user verification (registration is a second factor, not standalone login)", async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({ verified: false });
    await verifyRegistration({ response: {} } as never, "challenge");
    expect(mockVerifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requireUserVerification: false })
    );
  });

  it("returns null instead of throwing when the library rejects a malformed response", async () => {
    mockVerifyRegistrationResponse.mockRejectedValue(new Error("boom"));
    const result = await verifyRegistration({ response: {} } as never, "challenge");
    expect(result).toBeNull();
  });
});

describe("buildAuthenticationOptions", () => {
  it("builds allow credentials from existing passkeys with userVerification discouraged", async () => {
    mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: "chal" });
    const credentialId = isoBase64URL.fromBuffer(new Uint8Array([9]));

    await buildAuthenticationOptions([{ credentialId, transports: null }]);

    expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ userVerification: "discouraged" })
    );
    const call = mockGenerateAuthenticationOptions.mock.calls[0][0];
    expect(call.allowCredentials).toHaveLength(1);
    expect(call.allowCredentials[0].id).toBe(credentialId);
  });
});

describe("verifyAuthentication", () => {
  it("passes the stored credential decoded to buffers and returns verified + newCounter", async () => {
    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    const credentialId = isoBase64URL.fromBuffer(new Uint8Array([1]));
    const publicKey = isoBase64URL.fromBuffer(new Uint8Array([2]));

    const result = await verifyAuthentication({} as never, "challenge", {
      credentialId,
      publicKey,
      counter: 4,
      transports: null,
    });

    expect(result).toEqual({ verified: true, newCounter: 5 });
    const call = mockVerifyAuthenticationResponse.mock.calls[0][0];
    expect(call.credential.id).toBe(credentialId);
    expect(isoBase64URL.fromBuffer(call.credential.publicKey)).toBe(publicKey);
    expect(call.credential.counter).toBe(4);
  });

  it("does not require user verification (this is a second factor, not standalone login)", async () => {
    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    await verifyAuthentication({} as never, "challenge", {
      credentialId: isoBase64URL.fromBuffer(new Uint8Array([1])),
      publicKey: isoBase64URL.fromBuffer(new Uint8Array([2])),
      counter: 0,
      transports: null,
    });
    expect(mockVerifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requireUserVerification: false })
    );
  });

  it("returns verified: false and keeps the stored counter when the library throws", async () => {
    mockVerifyAuthenticationResponse.mockRejectedValue(new Error("User verification required, but user could not be verified"));
    const result = await verifyAuthentication({} as never, "challenge", {
      credentialId: isoBase64URL.fromBuffer(new Uint8Array([1])),
      publicKey: isoBase64URL.fromBuffer(new Uint8Array([2])),
      counter: 7,
      transports: null,
    });
    expect(result).toEqual({ verified: false, newCounter: 7 });
  });
});

describe("challenge cookie", () => {
  function req(cookieValue?: string) {
    const headers = new Headers();
    if (cookieValue) headers.set("cookie", `sam_webauthn_challenge=${cookieValue}`);
    return new NextRequest("http://localhost/api/auth/passkey/registration-verify", { headers });
  }

  it("round-trips a challenge for the matching userId and purpose", async () => {
    const res = NextResponse.json({ ok: true });
    await setChallengeCookie(res, "user-1", "registration", "the-challenge");
    const cookieValue = res.cookies.get("sam_webauthn_challenge")!.value;

    const challenge = await readChallengeCookie(req(cookieValue), "user-1", "registration");
    expect(challenge).toBe("the-challenge");
  });

  it("returns null when the userId does not match", async () => {
    const res = NextResponse.json({ ok: true });
    await setChallengeCookie(res, "user-1", "registration", "the-challenge");
    const cookieValue = res.cookies.get("sam_webauthn_challenge")!.value;

    const challenge = await readChallengeCookie(req(cookieValue), "user-2", "registration");
    expect(challenge).toBeNull();
  });

  it("returns null when the purpose does not match", async () => {
    const res = NextResponse.json({ ok: true });
    await setChallengeCookie(res, "user-1", "registration", "the-challenge");
    const cookieValue = res.cookies.get("sam_webauthn_challenge")!.value;

    const challenge = await readChallengeCookie(req(cookieValue), "user-1", "authentication");
    expect(challenge).toBeNull();
  });

  it("returns null when there is no cookie at all", async () => {
    const challenge = await readChallengeCookie(req(), "user-1", "registration");
    expect(challenge).toBeNull();
  });

  it("clearChallengeCookie expires the cookie", () => {
    const res = NextResponse.json({ ok: true });
    clearChallengeCookie(res);
    const cookie = res.cookies.get("sam_webauthn_challenge");
    expect(cookie?.value).toBe("");
  });
});
