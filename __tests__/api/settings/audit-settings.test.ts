// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    appSetting: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const putObject = vi.fn();
const deleteObject = vi.fn();
vi.mock("@/lib/uploads/storage", async () => ({
  ...(await vi.importActual<typeof import("@/lib/uploads/storage")>("@/lib/uploads/storage")),
  getStorageDriver: () => ({ putObject, deleteObject, getObject: vi.fn() }),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PUT as putGeneral } from "@/app/api/settings/general/route";
import { PUT as putExport } from "@/app/api/settings/export/route";
import { PUT as putBranding } from "@/app/api/settings/branding/route";
import { POST as uploadLogo, DELETE as removeLogo } from "@/app/api/settings/branding/logo/route";
import { POST as uploadFavicon, DELETE as removeFavicon } from "@/app/api/settings/branding/favicon/route";
import { POST as uploadBackground, DELETE as removeBackground } from "@/app/api/settings/branding/background/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function jsonReq(url: string, body: object, method = "PUT") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// SVG: text content survives jsdom's multipart round trip and passes the content check.
function fileReq(url: string, type: string) {
  const fd = new FormData();
  fd.set("file", new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"/>"], "f.svg", { type }));
  return new NextRequest(url, { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.appSetting.deleteMany).mockResolvedValue({ count: 1 } as never);
});

describe("audit — general settings", () => {
  it("logs UPDATE on Setting", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await putGeneral(jsonReq("http://localhost/api/settings/general", { hostnameUrlTemplate: "https://x/{hostname}" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "Setting", entityName: "General settings" })
    );
  });

  it("leaves omitted templates unchanged", async () => {
    mockAuth.mockResolvedValue(session() as never);
    await putGeneral(jsonReq("http://localhost/api/settings/general", { hostnameUrlTemplate: "https://x/{hostname}" }));
    expect(vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => arg.where.key)).toEqual(["hostname.urlTemplate"]);
  });

  it("does not log for non-admin (403)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await putGeneral(jsonReq("http://localhost/api/settings/general", {}));
    expect(res.status).toBe(403);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

describe("audit — export settings", () => {
  it("logs UPDATE on Setting", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await putExport(jsonReq("http://localhost/api/settings/export", { enabled: true }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "Setting", entityName: "Export settings" })
    );
  });
});

describe("audit — branding settings", () => {
  it("logs UPDATE on Setting for title change", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await putBranding(jsonReq("http://localhost/api/settings/branding", { appTitle: "MyApp" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "Setting",
        entityName: "Branding settings",
        detail: expect.objectContaining({ "app.title": "MyApp" }),
      })
    );
  });

  it("removes the background mode setting when set to the default", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await putBranding(jsonReq("http://localhost/api/settings/branding", { backgroundMode: "" }));
    expect(res.status).toBe(200);
    expect(prisma.appSetting.deleteMany).toHaveBeenCalledWith({ where: { key: { in: ["branding.backgroundMode"] } } });
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: { "branding.backgroundMode": "(none)" } }));
  });
});

describe("audit — branding asset uploads/removals", () => {
  it("logs logo upload", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await uploadLogo(fileReq("http://localhost/api/settings/branding/logo", "image/svg+xml"));
    expect(res.status).toBe(200);
    expect(putObject).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "Setting", detail: expect.objectContaining({ event: "Logo uploaded" }) })
    );
  });

  it("logs logo removal", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await removeLogo(new NextRequest("http://localhost/api/settings/branding/logo", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ event: "Logo removed" }) })
    );
  });

  it("logs favicon upload", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await uploadFavicon(fileReq("http://localhost/api/settings/branding/favicon", "image/svg+xml"));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ event: "Favicon uploaded" }) })
    );
  });

  it("logs favicon removal", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await removeFavicon(new NextRequest("http://localhost/api/settings/branding/favicon", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ event: "Favicon removed" }) })
    );
  });

  it("logs background upload", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await uploadBackground(fileReq("http://localhost/api/settings/branding/background", "image/svg+xml"));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ event: "Background image uploaded" }) })
    );
  });

  it("logs background removal", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await removeBackground(new NextRequest("http://localhost/api/settings/branding/background", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ event: "Background image removed" }) })
    );
  });

  it("does not log upload for non-admin (403)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await uploadLogo(fileReq("http://localhost/api/settings/branding/logo", "image/svg+xml"));
    expect(res.status).toBe(403);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
