import { describe, it, expect } from "vitest";
import { ATTACHMENT_EXTENSIONS, ATTACHMENT_MIME_TYPES, contentMatchesType, safeFilename } from "@/lib/uploads/policy";

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

  it("accepts short text files; only the first 512 bytes are scanned for NUL", () => {
    expect(contentMatchesType(Buffer.from("ok"), "text/plain")).toBe(true);
    expect(contentMatchesType(Buffer.from("a;b"), "text/csv")).toBe(true);
    expect(contentMatchesType(Buffer.from([0x00]), "text/plain")).toBe(false);
    expect(contentMatchesType(Buffer.concat([Buffer.alloc(512, 0x61), Buffer.from([0x00])]), "text/plain")).toBe(true);
  });

  it("keeps the attachment allowlists aligned on PDF and images", () => {
    expect(ATTACHMENT_MIME_TYPES.has("application/pdf") && ATTACHMENT_EXTENSIONS.has(".pdf")).toBe(true);
    expect(ATTACHMENT_EXTENSIONS.has(".php")).toBe(false);
  });
});

describe("contentMatchesType() — legacy Office", () => {
  const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

  it("accepts an OLE2 compound file declared as .xls and rejects a ZIP", () => {
    expect(contentMatchesType(ole2, "application/vnd.ms-excel")).toBe(true);
    expect(contentMatchesType(zip, "application/vnd.ms-excel")).toBe(false);
  });

  it("still checks .xlsx as a ZIP archive", () => {
    expect(contentMatchesType(zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(contentMatchesType(ole2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
  });
});

describe("safeFilename()", () => {
  it("replaces header-breaking characters and caps the length", () => {
    expect(safeFilename('a"b\\c\r\nd.pdf')).toBe("a_b_c__d.pdf");
    expect(safeFilename("x".repeat(300))).toHaveLength(255);
  });
});
