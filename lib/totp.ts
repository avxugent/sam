/**
 * TOTP (Time-based One-Time Password) helpers for 2FA.
 * Uses speakeasy (RFC 6238 / RFC 4226) + qrcode for QR generation.
 * Only applicable to local credential accounts — SSO users skip 2FA entirely.
 */

import speakeasy from "speakeasy";
import QRCode from "qrcode";

const APP_NAME = "SAM – Asset Management";
/** Window of ±1 step (30 s each) to tolerate minor clock skew */
const WINDOW = 1;

/**
 * Generates a fresh TOTP secret for a user.
 * Returns the base32 secret to store in the DB and an otpauth:// URI
 * for encoding into a QR code.
 */
export function generateTotpSecret(userEmail: string): {
  base32: string;
  otpauthUrl: string;
} {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${APP_NAME} (${userEmail})`,
    issuer: APP_NAME,
  });

  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url ?? "",
  };
}

/**
 * Generates a QR code as a data URL (PNG base64) from an otpauth:// URI.
 * Suitable for embedding directly in an <img src="..."> tag.
 */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
  });
}

/**
 * Verifies a 6-digit TOTP code against the stored base32 secret.
 * Returns true if the code is valid within the allowed window.
 */
export function verifyTotpCode(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: token.replace(/\s/g, ""), // strip accidental spaces
    window: WINDOW,
  });
}
