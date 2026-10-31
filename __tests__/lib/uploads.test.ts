import { describe, it, expect } from "vitest";
import { ATTACHMENT_EXTENSIONS, ATTACHMENT_MIME_TYPES, contentMatchesType } from "@/lib/uploads";

describe("contentMatchesType()", () => {
  it("accepts content that starts like its type", () => {
    expect(contentMatchesType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), "image/png")).toBe(true);
    expect(contentMatchesType(Buffer.from([0, 0, 1, 0, 1, 0]), "image/x-icon")).toBe(true);
    expect(contentMatchesType(Buffer.from([0, 0, 1, 0, 1, 0]), "image/vnd.microsoft.icon")).toBe(true);
    expect(contentMatchesType(Buffer.from("<svg/>"), "image/svg+xml")).toBe(true);
  });

  it("rejects spoofed, binary-as-text, too-short and unknown content", () => {
    expect(contentMatchesType(Buffer.from("<html>"), "image/png")).toBe(false);
    expect(contentMatchesType(Buffer.from([0x3c, 0x73, 0x00, 0x67]), "image/svg+xml")).toBe(false);
    expect(contentMatchesType(Buffer.from([0x89]), "image/png")).toBe(false);
    expect(contentMatchesType(Buffer.from("abcd"), "application/x-sh")).toBe(false);
  });

  it("keeps the attachment allowlists aligned on PDF and images", () => {
    expect(ATTACHMENT_MIME_TYPES.has("application/pdf") && ATTACHMENT_EXTENSIONS.has(".pdf")).toBe(true);
    expect(ATTACHMENT_EXTENSIONS.has(".php")).toBe(false);
  });
});
