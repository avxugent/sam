import { startRegistration } from "@simplewebauthn/browser";
import { apiFetch, jsonBody, type ApiErrorBody } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/utils";

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

/** The API's message for a failed call (with any validation details), or null. */
function errorOf(error: ApiErrorBody): string | null {
  return apiErrorMessage(error) || null;
}

/** Starts TOTP enrollment: a fresh (pending) secret and its QR code. */
export async function requestTotpSetup(): Promise<{ ok: true; qrCodeDataUrl: string; secret: string } | Failure> {
  const res = await apiFetch<{ qrCodeDataUrl: string; secret: string }>("/api/auth/2fa/setup", { method: "POST" });
  if (!res.ok) return { ok: false, error: errorOf(res.error) };
  return { ok: true, qrCodeDataUrl: res.data.qrCodeDataUrl, secret: res.data.secret };
}

/** Confirms TOTP enrollment with the first code from the authenticator app. */
export async function confirmTotpSetup(code: string): Promise<{ ok: true } | Failure> {
  const res = await apiFetch("/api/auth/2fa/enable", jsonBody("POST", { code: normalizeTotpCode(code) }));
  return res.ok ? { ok: true } : { ok: false, error: errorOf(res.error) };
}

/** Registers a passkey on this device; `cancelled` is set when the user dismissed the browser prompt. */
export async function registerPasskey(label?: string): Promise<{ ok: true } | (Failure & { cancelled: boolean })> {
  const options = await apiFetch<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
    "/api/auth/passkey/registration-options",
    { method: "POST" }
  );
  if (!options.ok) return { ok: false, error: errorOf(options.error), cancelled: false };
  try {
    const attestation = await startRegistration({ optionsJSON: options.data.options });
    const verify = await apiFetch(
      "/api/auth/passkey/registration-verify",
      jsonBody("POST", { response: attestation, label: label?.trim() || undefined })
    );
    return verify.ok ? { ok: true } : { ok: false, error: errorOf(verify.error), cancelled: false };
  } catch (err) {
    return { ok: false, error: null, cancelled: err instanceof Error && err.name === "NotAllowedError" };
  }
}
