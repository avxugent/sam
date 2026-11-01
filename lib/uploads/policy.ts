/**
 * Upload validation shared by the attachment and branding uploads: content
 * checks against the declared MIME type, and the attachment allowlists.
 * Branding assets keep their own narrower type lists and size caps
 * (lib/branding/assets.ts) but use the same content check.
 */

/** Largest attachment upload: 50 MB. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** MIME types an attachment may declare. */
export const ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

/** Extensions kept on a stored attachment's name; anything else is dropped, whatever the MIME claim. */
export const ATTACHMENT_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv",
]);

/**
 * An attachment's original name made safe to store and to put in a
 * Content-Disposition header: CR, LF, quote and backslash become "_", and it
 * is capped at 255 characters.
 */
export function safeFilename(name: string): string {
  return name.replace(/[\r\n\\"]/g, "_").slice(0, 255);
}

/**
 * Whether the file content starts like its declared MIME type (magic bytes),
 * so a client cannot upload a dangerous file under a spoofed type. Text
 * types (including SVG) must not contain NUL bytes. Unknown types fail.
 */
export function contentMatchesType(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  switch (mimeType) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/gif":
      return (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      // ICO: reserved 0, type 1
      return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00;
    case "application/pdf":
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );
    case "application/msword":
    case "application/vnd.ms-excel":
      // Legacy .doc / .xls — Compound Document File (OLE2)
      return (
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0
      );
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // OOXML (.docx, .xlsx) are ZIP archives
      return (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
      );
    case "image/svg+xml":
    case "text/plain":
    case "text/csv":
      // Text formats: reject files containing null bytes in the first 512 bytes,
      // which would indicate binary content masquerading as text
      return !buffer.subarray(0, 512).includes(0x00);
    default:
      return false;
  }
}
