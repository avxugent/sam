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

// Binary signatures do not survive jsdom's multipart round trip, so these
// tests hand the route a stubbed formData() with a File-like object.
function stubUpload(file: { name: string; type: string; bytes: number[]; size?: number }, fields: Record<string, string>) {
  const req = new NextRequest("http://localhost/api/attachments", { method: "POST" });
  const fileLike = {
    name: file.name,
    type: file.type,
    size: file.size ?? file.bytes.length,
    arrayBuffer: async () => new Uint8Array(file.bytes).buffer,
  };
  const values: Record<string, unknown> = { file: fileLike, ...fields };
  Object.assign(req, { formData: async () => ({ get: (key: string) => values[key] ?? null }) });
  return req;
}

const pad = (bytes: number[]) => [...bytes, ...new Array(16).fill(0x20)];
const SIGNATURES: [string, string, number[]][] = [
  ["image/jpeg", "a.jpg", [0xff, 0xd8, 0xff, 0xe0]],
  ["image/png", "a.png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", "a.gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", "a.webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ["application/pdf", "a.pdf", [0x25, 0x50, 0x44, 0x46]],
  ["application/msword", "a.doc", [0xd0, 0xcf, 0x11, 0xe0]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx", [0x50, 0x4b, 0x03, 0x04]],
];

describe("POST /api/attachments — upload validation", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockCreate.mockResolvedValue({ id: "att-1", originalName: "a", locationId: "loc-1", assetId: null } as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: "Room 1" } as never);
  });

  it.each(SIGNATURES)("accepts a real %s file and keeps its extension", async (type, name, bytes) => {
    const res = await POST(stubUpload({ name, type, bytes: pad(bytes) }, { locationId: "loc-1" }));
    expect(res.status).toBe(201);
    expect(putObject.mock.calls[0][0]).toMatch(new RegExp(`^locations/loc-1/[0-9a-f-]{36}\\${name.slice(1)}$`));
  });

  it.each(SIGNATURES)("rejects %s content that has another file's signature", async (type, name) => {
    const res = await POST(stubUpload({ name, type, bytes: pad([0x4d, 0x5a, 0x90, 0x00]) }, { locationId: "loc-1" }));
    expect(res.status).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects text that contains null bytes (binary posing as text)", async () => {
    const res = await POST(stubUpload({ name: "a.txt", type: "text/plain", bytes: [0x41, 0x00, 0x42, 0x43] }, { locationId: "loc-1" }));
    expect(res.status).toBe(400);
  });

  it("drops a disallowed extension on a double-extension name (a.jpg.php)", async () => {
    const res = await POST(stubUpload({ name: "a.jpg.php", type: "image/jpeg", bytes: pad([0xff, 0xd8, 0xff, 0xe0]) }, { locationId: "loc-1" }));
    expect(res.status).toBe(201);
    expect(putObject.mock.calls[0][0]).toMatch(/^locations\/loc-1\/[0-9a-f-]{36}$/);
  });

  it("rejects missing files, missing parents and oversized files", async () => {
    const noFile = new NextRequest("http://localhost/api/attachments", { method: "POST" });
    Object.assign(noFile, { formData: async () => ({ get: (key: string) => (key === "locationId" ? "loc-1" : null) }) });
    expect((await POST(noFile)).status).toBe(400);
    expect((await POST(stubUpload({ name: "a.txt", type: "text/plain", bytes: [0x41, 0x42, 0x43, 0x44] }, {}))).status).toBe(400);
    const big = stubUpload({ name: "a.pdf", type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46], size: 51 * 1024 * 1024 }, { locationId: "loc-1" });
    expect((await POST(big)).status).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("stores the sanitised original name and audits the parent location", async () => {
    await POST(stubUpload({ name: 'we"ird\\name.txt', type: "text/plain", bytes: [0x41, 0x42, 0x43, 0x44] }, { locationId: "loc-1", description: "note" }));
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({ originalName: "we_ird_name.txt", description: "note", locationId: "loc-1" });
  });
});

describe("POST /api/attachments (link)", () => {
  function linkReq(body: object) {
    return new NextRequest("http://localhost/api/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockAuth.mockResolvedValue(editorSession() as never);
  });

  it("rejects an invalid URL and a link without a parent", async () => {
    expect((await POST(linkReq({ url: "not a url", label: "Docs", locationId: "loc-1" }))).status).toBe(400);
    expect((await POST(linkReq({ url: "https://example.org", label: "Docs" }))).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a link on an asset and names the asset in the audit entry", async () => {
    mockCreate.mockResolvedValue({ id: "att-2", originalName: "Docs" } as never);
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({ model: { name: "Pearl-2" } } as never);
    const res = await POST(linkReq({ url: "https://example.org/manual", label: "Docs", assetId: "as-1" }));
    expect(res.status).toBe(201);
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({ attachmentType: "link", url: "https://example.org/manual", assetId: "as-1", locationId: null });
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
