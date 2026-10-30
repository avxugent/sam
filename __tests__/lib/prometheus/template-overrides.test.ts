import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { findUnique: vi.fn() },
    manufacturer: { findUnique: vi.fn() },
    assetTypeModelTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    assetTypeManufacturerTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  createTemplateOverride,
  deleteTemplateOverride,
  listTemplateOverrides,
  manufacturerTemplates,
  modelTemplates,
  updateTemplateOverride,
} from "@/lib/prometheus/template-overrides";

const session = { user: { id: "u1", role: "ADMIN" } } as never;
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const tpl = "__address__=https://x";

beforeEach(() => vi.clearAllMocks());

describe("listTemplateOverrides()", () => {
  it("flattens the manufacturer name into each row", async () => {
    vi.mocked(prisma.assetTypeModelTemplate.findMany).mockResolvedValue([
      { id: "o1", manufacturerId: "m1", model: "XPS", scrapeTargetTemplate: tpl, manufacturer: { name: "Dell" } },
    ] as never);
    const res = await listTemplateOverrides(modelTemplates, "t1");
    expect(await res.json()).toEqual([{ id: "o1", manufacturerId: "m1", model: "XPS", scrapeTargetTemplate: tpl, manufacturerName: "Dell" }]);
  });
});

describe("createTemplateOverride()", () => {
  beforeEach(() => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "Recorder" } as never);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValue({ name: "Dell" } as never);
  });

  it("404 for an unknown asset type (path), 400 for an unknown manufacturer (body)", async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce(null as never);
    expect((await createTemplateOverride(post({}), session, manufacturerTemplates, "t1")).status).toBe(404);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValueOnce(null as never);
    expect((await createTemplateOverride(post({ manufacturerId: "m1", scrapeTargetTemplate: tpl }), session, manufacturerTemplates, "t1")).status).toBe(400);
  });

  it("400 for template syntax errors, with the problems as details", async () => {
    const res = await createTemplateOverride(post({ manufacturerId: "m1", scrapeTargetTemplate: "no equals sign" }), session, manufacturerTemplates, "t1");
    expect(res.status).toBe(400);
    expect((await res.json()).details.length).toBeGreaterThan(0);
  });

  it("requires a model for model overrides", async () => {
    expect((await createTemplateOverride(post({ manufacturerId: "m1", scrapeTargetTemplate: tpl }), session, modelTemplates, "t1")).status).toBe(400);
  });

  it("409 names the duplicate", async () => {
    vi.mocked(prisma.assetTypeModelTemplate.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await createTemplateOverride(post({ manufacturerId: "m1", model: "XPS", scrapeTargetTemplate: tpl }), session, modelTemplates, "t1");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Dell / XPS already has a scrape template override for this asset type.");
  });

  it("201 with the created override and an audit entry", async () => {
    vi.mocked(prisma.assetTypeManufacturerTemplate.create).mockResolvedValue({ id: "o1", manufacturerId: "m1", scrapeTargetTemplate: tpl } as never);
    const res = await createTemplateOverride(post({ manufacturerId: "m1", scrapeTargetTemplate: tpl }), session, manufacturerTemplates, "t1");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "o1", manufacturerId: "m1", manufacturerName: "Dell", scrapeTargetTemplate: tpl });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityName: "Recorder / Dell" }));
  });
});

describe("update/delete", () => {
  const row = { id: "o1", manufacturerId: "m1", model: "XPS", scrapeTargetTemplate: tpl, manufacturer: { name: "Dell" }, type: { name: "Recorder" } };

  it("404 when the override does not exist", async () => {
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue(null as never);
    expect((await updateTemplateOverride(post({ scrapeTargetTemplate: tpl }), session, modelTemplates, "o1")).status).toBe(404);
    expect((await deleteTemplateOverride(post({}), session, modelTemplates, "o1")).status).toBe(404);
  });

  it("updates the template and audits with the full name", async () => {
    vi.mocked(prisma.assetTypeModelTemplate.findUnique).mockResolvedValue(row as never);
    vi.mocked(prisma.assetTypeModelTemplate.update).mockResolvedValue({ scrapeTargetTemplate: "a=b" } as never);
    const res = await updateTemplateOverride(post({ scrapeTargetTemplate: "a=b" }), session, modelTemplates, "o1");
    expect(await res.json()).toMatchObject({ id: "o1", model: "XPS", scrapeTargetTemplate: "a=b" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityName: "Recorder / Dell / XPS" }));
  });

  it("deletes and audits", async () => {
    vi.mocked(prisma.assetTypeManufacturerTemplate.findUnique).mockResolvedValue({ ...row, model: undefined } as never);
    const res = await deleteTemplateOverride(post({}), session, manufacturerTemplates, "o1");
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.assetTypeManufacturerTemplate.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
  });
});
