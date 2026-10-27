/**
 * TOTP (Time-based One-Time Password) helpers for 2FA.
 * RFC 6238 (HMAC-SHA1, 6 digits, 30 s step) on node:crypto, plus qrcode for QR generation.
 * Only applicable to local credential accounts — SSO users skip 2FA entirely.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";

export const APP_NAME = "SAM – Asset Management";
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Window of ±1 step (30 s each) to tolerate minor clock skew */
const WINDOW = 1;
const SECRET_BYTES = 20;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, uppercase, no padding — the form authenticator apps expect. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32, ignoring case, spaces and "=" padding. Returns null on an invalid character. */
export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP value for `counter`, zero-padded to `digits`. */
function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/** The TOTP code for a base32 secret at `timeMs` (defaults to now). */
export function generateTotpCode(secret: string, timeMs = Date.now()): string {
  const key = base32Decode(secret) ?? Buffer.alloc(0);
  return hotp(key, Math.floor(timeMs / 1000 / STEP_SECONDS));
}

/**
 * Generates a fresh TOTP secret for a user.
 * Returns the base32 secret to store in the DB and an otpauth:// URI
 * for encoding into a QR code.
 */
export function generateTotpSecret(userEmail: string): {
  base32: string;
  otpauthUrl: string;
} {
  const base32 = base32Encode(randomBytes(SECRET_BYTES));
  const label = encodeURIComponent(`${APP_NAME} (${userEmail})`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${base32}&issuer=${encodeURIComponent(APP_NAME)}`;
  return { base32, otpauthUrl };
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
export function verifyTotpCode(secret: string, token: string, timeMs = Date.now()): boolean {
  const provided = token.replace(/\s/g, ""); // strip accidental spaces
  if (!/^\d{6}$/.test(provided)) return false;
  const key = base32Decode(secret);
  if (!key || key.length === 0) return false;

  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  let valid = false;
  for (let step = -WINDOW; step <= WINDOW; step++) {
    // Check every step (no early return) so timing doesn't reveal which one matched.
    const expected = hotp(key, counter + step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) valid = true;
  }
  return valid;
}
