import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Every read-then-write handler re-checks the record at write time: a record
// deleted by a concurrent request between the read and the write (Prisma P2025)
// is the same 404 as one that was never there, not a 500.

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const model = () => ({ findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() });
  return {
    prisma: {
      report: model(),
      maintenancePreset: model(),
      workLog: model(),
      attachment: model(),
      user: model(),
      manufacturer: model(),
      model: model(),
      supplier: model(),
      assetType: model(),
      workLogItem: model(),
      asset: model(),
      stockItem: model(),
    },
  };
});

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import * as reports from "@/app/api/reports/[id]/route";
import * as presets from "@/app/api/asset-types/presets/[id]/route";
import * as workLogs from "@/app/api/work-logs/[id]/route";
import * as attachments from "@/app/api/attachments/[id]/route";
import * as users from "@/app/api/users/[id]/route";
import * as manufacturers from "@/app/api/manufacturers/[id]/route";
import * as models from "@/app/api/models/[id]/route";
import * as suppliers from "@/app/api/suppliers/[id]/route";
import * as assetTypes from "@/app/api/asset-types/[id]/route";
import * as workLogItems from "@/app/api/work-log-items/[id]/route";

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
type Delegate = { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const delegate = (name: keyof typeof prisma) => prisma[name] as unknown as Delegate;

const existing = {
  name: "Thing",
  description: "desc",
  email: "a@b.c",
  role: "EDITOR",
  provider: "credentials",
  performedById: "u1",
  performedAt: new Date("2026-01-01"),
  attachmentType: "link",
  path: null,
  originalName: "file.txt",
};

const cases: { label: string; handler: Handler; method: "PUT" | "DELETE"; model: keyof typeof prisma; body?: object; noun: string }[] = [
  { label: "PUT /api/reports/[id]", handler: reports.PUT, method: "PUT", model: "report", body: { name: "New" }, noun: "Report" },
  { label: "DELETE /api/reports/[id]", handler: reports.DELETE, method: "DELETE", model: "report", noun: "Report" },
  { label: "PUT /api/asset-types/presets/[id]", handler: presets.PUT, method: "PUT", model: "maintenancePreset", body: { name: "New" }, noun: "Preset" },
  { label: "DELETE /api/asset-types/presets/[id]", handler: presets.DELETE, method: "DELETE", model: "maintenancePreset", noun: "Preset" },
  { label: "PUT /api/work-logs/[id]", handler: workLogs.PUT, method: "PUT", model: "workLog", body: { description: "New" }, noun: "Work log" },
  { label: "DELETE /api/work-logs/[id]", handler: workLogs.DELETE, method: "DELETE", model: "workLog", noun: "Work log" },
  { label: "PUT /api/attachments/[id]", handler: attachments.PUT, method: "PUT", model: "attachment", body: { displayName: "New" }, noun: "Attachment" },
  { label: "DELETE /api/attachments/[id]", handler: attachments.DELETE, method: "DELETE", model: "attachment", noun: "Attachment" },
  { label: "PUT /api/users/[id]", handler: users.PUT, method: "PUT", model: "user", body: { name: "New" }, noun: "User" },
  { label: "DELETE /api/users/[id]", handler: users.DELETE, method: "DELETE", model: "user", noun: "User" },
  { label: "DELETE /api/manufacturers/[id]", handler: manufacturers.DELETE, method: "DELETE", model: "manufacturer", noun: "Manufacturer" },
  { label: "DELETE /api/models/[id]", handler: models.DELETE, method: "DELETE", model: "model", noun: "Model" },
  { label: "DELETE /api/suppliers/[id]", handler: suppliers.DELETE, method: "DELETE", model: "supplier", noun: "Supplier" },
  { label: "DELETE /api/asset-types/[id]", handler: assetTypes.DELETE, method: "DELETE", model: "assetType", noun: "Asset type" },
  { label: "DELETE /api/work-log-items/[id]", handler: workLogItems.DELETE, method: "DELETE", model: "workLogItem", noun: "Work log item" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN", email: "admin@b.c" } } as never);
  // Usage / last-admin guards pass: nothing references the record, several admins exist.
  for (const name of ["asset", "model", "stockItem", "user"] as const) {
    vi.mocked(prisma[name].count).mockResolvedValue((name === "user" ? 3 : 0) as never);
  }
});

describe.each(cases)("$label", ({ handler, method, model, body, noun }) => {
  it("404 when the record is deleted between the read and the write (P2025)", async () => {
    const d = delegate(model);
    d.findUnique.mockResolvedValue(existing);
    d.update.mockRejectedValue({ code: "P2025" });
    d.delete.mockRejectedValue({ code: "P2025" });
    const req = new NextRequest("http://localhost/api/x/rec1", {
      method,
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });

    const res = await handler(req, { params: Promise.resolve({ id: "rec1" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `${noun} not found.` });
    expect(method === "PUT" ? d.update : d.delete).toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("rethrows any other write error", async () => {
    const d = delegate(model);
    d.findUnique.mockResolvedValue(existing);
    d.update.mockRejectedValue(new Error("db down"));
    d.delete.mockRejectedValue(new Error("db down"));
    const req = new NextRequest("http://localhost/api/x/rec1", {
      method,
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });

    await expect(handler(req, { params: Promise.resolve({ id: "rec1" }) })).rejects.toThrow("db down");
  });
});
