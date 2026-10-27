import { startRegistration } from "@simplewebauthn/browser";

/**
 * Browser-side calls for enrolling a second factor, shared by the forced setup
 * page and the profile settings. Each returns a result instead of throwing so
 * callers decide how to surface errors.
 */

type Failure = { ok: false; error: string | null };

/** Codes are shown in groups ("123 456"); the API expects the six digits. */
export function normalizeTotpCode(code: string): string {
  return code.replace(/\s/g, "");
}

async function errorOf(res: Response): Promise<string | null> {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : null;
}

/** Starts TOTP enrollment: a fresh (pending) secret and its QR code. */
export async function requestTotpSetup(): Promise<{ ok: true; qrCodeDataUrl: string; secret: string } | Failure> {
  try {
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    const data = await res.json();
    return { ok: true, qrCodeDataUrl: data.qrCodeDataUrl, secret: data.secret };
  } catch {
    return { ok: false, error: null };
  }
}

/** Confirms TOTP enrollment with the first code from the authenticator app. */
export async function confirmTotpSetup(code: string): Promise<{ ok: true } | Failure> {
  try {
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizeTotpCode(code) }),
    });
    return res.ok ? { ok: true } : { ok: false, error: await errorOf(res) };
  } catch {
    return { ok: false, error: null };
  }
}

/** Registers a passkey on this device; `cancelled` is set when the user dismissed the browser prompt. */
export async function registerPasskey(label?: string): Promise<{ ok: true } | (Failure & { cancelled: boolean })> {
  try {
    const optionsRes = await fetch("/api/auth/passkey/registration-options", { method: "POST" });
    if (!optionsRes.ok) return { ok: false, error: await errorOf(optionsRes), cancelled: false };
    const { options } = await optionsRes.json();

    const attestation = await startRegistration({ optionsJSON: options });

    const verifyRes = await fetch("/api/auth/passkey/registration-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: attestation, label: label?.trim() || undefined }),
    });
    return verifyRes.ok ? { ok: true } : { ok: false, error: await errorOf(verifyRes), cancelled: false };
  } catch (err) {
    return { ok: false, error: null, cancelled: err instanceof Error && err.name === "NotAllowedError" };
  }
}
