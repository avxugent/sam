/** An uploaded file, or a link to an external URL. */
export type AttachmentKind = "file" | "link";

/** The attachmentType column (a plain string in the schema, written as "file" or "link") as an AttachmentKind. */
export function attachmentKind(value: string): AttachmentKind {
  return value === "link" ? "link" : "file";
}

/** An attachment as the gallery shows it (page props, or the attachments API's JSON). */
export type Attachment = {
  id: string;
  attachmentType: AttachmentKind;
  filename?: string | null;
  originalName: string;
  displayName?: string | null;
  description?: string | null;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string };
};

/** The name to show: the display name when set, else the uploaded file's name. */
export function attachmentLabel(att: Attachment): string {
  return att.displayName?.trim() || att.originalName;
}

export function isPreviewableImage(mimeType?: string | null): boolean {
  return (
    !!mimeType?.startsWith("image/") &&
    mimeType !== "image/svg+xml" // SVG forced to download by server
  );
}
