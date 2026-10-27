import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn() }));

import { startRegistration } from "@simplewebauthn/browser";
import { confirmTotpSetup, normalizeTotpCode, registerPasskey, requestTotpSetup } from "@/lib/two-factor/enrollment-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

beforeEach(() => vi.clearAllMocks());

describe("enrollment client", () => {
  it("normalizes grouped codes", () => {
    expect(normalizeTotpCode("123 456")).toBe("123456");
  });

  it("returns the QR code and secret, or the API error", async () => {
    mockFetch.mockResolvedValueOnce(json({ qrCodeDataUrl: "data:x", secret: "S" }));
    expect(await requestTotpSetup()).toEqual({ ok: true, qrCodeDataUrl: "data:x", secret: "S" });
    mockFetch.mockResolvedValueOnce(json({ error: "SSO account" }, false));
    expect(await requestTotpSetup()).toEqual({ ok: false, error: "SSO account" });
  });

  it("sends the normalized code to enable", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    expect(await confirmTotpSetup("123 456")).toEqual({ ok: true });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ code: "123456" });
  });

  it("registers a passkey and reports a dismissed prompt as cancelled", async () => {
    mockFetch.mockResolvedValueOnce(json({ options: { challenge: "c" } })).mockResolvedValueOnce(json({ ok: true }));
    vi.mocked(startRegistration).mockResolvedValueOnce({ id: "cred" } as never);
    expect(await registerPasskey(" Laptop ")).toEqual({ ok: true });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ response: { id: "cred" }, label: "Laptop" });

    mockFetch.mockResolvedValueOnce(json({ options: {} }));
    vi.mocked(startRegistration).mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    expect(await registerPasskey()).toEqual({ ok: false, error: null, cancelled: true });
  });
});
