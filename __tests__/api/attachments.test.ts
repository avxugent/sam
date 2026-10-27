import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    attachment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    location: { findUnique: vi.fn() },
    asset: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    getStorageDriver: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStorageDriver, StorageNotFoundError } from "@/lib/storage";
import { POST } from "@/app/api/attachments/route";
import { GET, DELETE, PATCH } from "@/app/api/attachments/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.attachment.findUnique);
const mockCreate = vi.mocked(prisma.attachment.create);
const mockDelete = vi.mocked(prisma.attachment.delete);
const mockUpdate = vi.mocked(prisma.attachment.update);
const mockGetDriver = vi.mocked(getStorageDriver);

const putObject = vi.fn().mockResolvedValue(undefined);
const getObject = vi.fn();
const deleteObject = vi.fn().mockResolvedValue(undefined);

function fakeDriver() {
  return { name: "local" as const, putObject, getObject, deleteObject };
}

function adminSession() {
  return { user: { id: "u1", role: "ADMIN", email: "a@x", name: "Admin" } };
}
function viewerSession() {
  return { user: { id: "u2", role: "VIEWER", email: "v@x", name: "V" } };
}
function editorSession() {
  return { user: { id: "u3", role: "EDITOR", email: "e@x", name: "E" } };
}

// Use a plain-text file for happy-path tests: validateMagicBytes() checks
// "no null bytes in first 512" for text/plain, which survives the
// multipart/form-data encoding round-trip in the test environment cleanly.
// Binary magic-byte happy paths are exercised live, not in unit tests.
const TEXT_BODY = "hello world, no nulls here";

function makeMultipartReq(file: File, fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("file", file);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new NextRequest("http://localhost/api/attachments", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  putObject.mockClear().mockResolvedValue(undefined);
  getObject.mockReset();
  deleteObject.mockClear().mockResolvedValue(undefined);
  mockGetDriver.mockReturnValue(fakeDriver());
});

// ── POST /api/attachments ────────────────────────────────────────────────────

describe("POST /api/attachments (file upload)", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const req = makeMultipartReq(new File([TEXT_BODY], "x.txt", { type: "text/plain" }), { locationId: "loc-1" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const req = makeMultipartReq(new File([TEXT_BODY], "x.txt", { type: "text/plain" }), { locationId: "loc-1" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for disallowed MIME type", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    const req = makeMultipartReq(new File([TEXT_BODY], "x.exe", { type: "application/x-msdownload" }), { locationId: "loc-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when content does not match declared MIME (magic bytes)", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    // Declare image/png but send plain text — must fail magic-byte check
    const fake = new File(["not a png"], "x.png", { type: "image/png" });
    const req = makeMultipartReq(fake, { locationId: "loc-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for traversal-shaped locationId", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    const req = makeMultipartReq(new File([TEXT_BODY], "x.txt", { type: "text/plain" }), { locationId: "../etc" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("happy path: calls storage.putObject and creates DB row", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockCreate.mockResolvedValue({ id: "att-1", originalName: "x.txt", locationId: "loc-1", assetId: null } as never);

    const req = makeMultipartReq(new File([TEXT_BODY], "x.txt", { type: "text/plain" }), { locationId: "loc-1" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(putObject).toHaveBeenCalledTimes(1);
    const [key, , contentType] = putObject.mock.calls[0];
    // Note: extension may be dropped by the test env's multipart round-trip;
    // assert only the prefix shape (location subdir + UUID).
    expect(key).toMatch(/^locations\/loc-1\/[0-9a-f-]{36}/);
    expect(contentType).toBe("text/plain");
  });
});

// ── GET /api/attachments/[id] ────────────────────────────────────────────────

describe("GET /api/attachments/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(new NextRequest("http://x/api/attachments/a"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when attachment row is missing", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await GET(new NextRequest("http://x/api/attachments/a"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when storage reports the object missing", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", path: "locations/x/y.png", originalName: "y.png", mimeType: "image/png",
    } as never);
    getObject.mockRejectedValue(new StorageNotFoundError("locations/x/y.png"));

    const res = await GET(new NextRequest("http://x/api/attachments/a"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(404);
  });

  it("happy path: streams body with Content-Type and Content-Disposition", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", path: "locations/x/y.png", originalName: "y.png", mimeType: "image/png",
    } as never);
    getObject.mockResolvedValue(Buffer.from("PNGDATA"));

    const res = await GET(new NextRequest("http://x/api/attachments/a"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toMatch(/inline; filename="y.png"/);
  });

  it("forces SVG to attachment disposition (XSS guard)", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", path: "x/y.svg", originalName: "y.svg", mimeType: "image/svg+xml",
    } as never);
    getObject.mockResolvedValue(Buffer.from("<svg/>"));

    const res = await GET(new NextRequest("http://x/api/attachments/a"), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });
});

// ── PATCH /api/attachments/[id] ──────────────────────────────────────────────

describe("PATCH /api/attachments/[id]", () => {
  function patch(body: object) {
    return PATCH(
      new NextRequest("http://x/api/attachments/a", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "a" }) }
    );
  }

  beforeEach(() => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", originalName: "y.png", displayName: "Old name", description: "Old text", url: null,
    } as never);
    mockUpdate.mockResolvedValue({ id: "a", displayName: "New name", originalName: "y.png" } as never);
  });

  it("only updates the fields that were sent", async () => {
    expect((await patch({ displayName: "New name" })).status).toBe(200);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ displayName: "New name" });
  });

  it("clears a field sent as null", async () => {
    await patch({ description: null });
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ description: null });
  });

  it("rejects a URL on a file attachment", async () => {
    expect((await patch({ url: "https://example.com" })).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/attachments/[id] ─────────────────────────────────────────────

describe("DELETE /api/attachments/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(new NextRequest("http://x/api/attachments/a", { method: "DELETE" }), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await DELETE(new NextRequest("http://x/api/attachments/a", { method: "DELETE" }), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(403);
  });

  it("keeps the DB row and answers 502 when storage deletion fails", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", path: "x/y.png", originalName: "y.png", mimeType: "image/png",
    } as never);
    deleteObject.mockRejectedValueOnce(new Error("storage went away"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(new NextRequest("http://x/api/attachments/a", { method: "DELETE" }), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(502);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("happy path: calls storage.deleteObject and removes DB row", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockFindUnique.mockResolvedValue({
      id: "a", attachmentType: "file", path: "x/y.png", originalName: "y.png", mimeType: "image/png",
    } as never);
    mockDelete.mockResolvedValue({ id: "a" } as never);

    const res = await DELETE(new NextRequest("http://x/api/attachments/a", { method: "DELETE" }), {
      params: Promise.resolve({ id: "a" }),
    });
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("x/y.png");
  });
});
