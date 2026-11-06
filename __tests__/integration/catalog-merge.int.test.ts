// @vitest-environment node
/**
 * Opt-in integration test for the catalog merge transactions in
 * app/api/{asset-types,manufacturers,models}/[id]/merge, which the unit tests
 * only check against a mocked Prisma. Calls the route handlers as an admin
 * (mocked auth()) against a real MySQL; see locations-path.int.test.ts for how
 * to run it. Every row is named with a unique prefix and removed afterwards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, leftovers, newTag, testSession } from "./fixtures";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("catalog merges (integration)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  const tag = newTag("merge");
  let locationId = "";

  const mergeRequest = (path: string, targetId: string) =>
    new NextRequest(`http://localhost/api/${path}/merge`, {
      method: "POST",
      body: JSON.stringify({ targetId }),
      headers: { "content-type": "application/json" },
    });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(testSession(tag, "ADMIN") as never);
    locationId = (await prisma.location.create({ data: { name: `${tag} room` } })).id;
  });

  afterAll(async () => {
    await cleanup(prisma, tag);
    expect(await leftovers(prisma, tag)).toBe(0);
    await prisma.$disconnect();
  });

  async function auditFor(entityId: string) {
    return prisma.auditLog.findMany({ where: { userId: `${tag}-user`, entityId } });
  }

  it("asset type merge moves assets, stock and models, folds same-named models and deletes the source", async () => {
    const brand = await prisma.manufacturer.create({ data: { name: `${tag} brand A` } });
    const source = await prisma.assetType.create({ data: { name: `${tag} type src` } });
    const target = await prisma.assetType.create({ data: { name: `${tag} type dst` } });
    const moved = await prisma.model.create({ data: { name: `${tag} model unique`, typeId: source.id, manufacturerId: brand.id } });
    const folded = await prisma.model.create({ data: { name: `${tag} model shared`, typeId: source.id, manufacturerId: brand.id } });
    const existing = await prisma.model.create({ data: { name: `${tag} model shared`, typeId: target.id, manufacturerId: brand.id } });
    const a1 = await prisma.asset.create({ data: { locationId, typeId: source.id, manufacturerId: brand.id, modelId: moved.id } });
    const a2 = await prisma.asset.create({ data: { locationId, typeId: source.id, manufacturerId: brand.id, modelId: folded.id } });
    const stock = await prisma.stockItem.create({ data: { typeId: source.id, manufacturerId: brand.id, modelId: folded.id, quantity: 2 } });
    await prisma.maintenancePreset.create({ data: { assetTypeId: source.id, name: `${tag} preset` } });

    const { POST } = await import("@/app/api/asset-types/[id]/merge/route");
    const res = await POST(mergeRequest(`asset-types/${source.id}`, target.id), params(source.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetsMoved: 2, stockItemsMoved: 1, modelsMoved: 1, modelsFolded: 1 });

    expect(await prisma.assetType.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prisma.maintenancePreset.count({ where: { assetTypeId: source.id } })).toBe(0);
    expect(await prisma.model.findUnique({ where: { id: folded.id } })).toBeNull();
    expect((await prisma.model.findUniqueOrThrow({ where: { id: moved.id } })).typeId).toBe(target.id);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({ typeId: target.id, modelId: moved.id });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: a2.id } })).toMatchObject({ typeId: target.id, modelId: existing.id });
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({ typeId: target.id, modelId: existing.id });

    const audit = await auditFor(source.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "DELETE", entityType: "AssetType", entityName: source.name });
    expect(JSON.parse(audit[0].detail!).snapshot["Merged into"]).toBe(target.name);
  });

  it("manufacturer merge moves rows and template overrides, keeping the target's on a collision", async () => {
    const typeA = await prisma.assetType.create({ data: { name: `${tag} mtype A` } });
    const typeB = await prisma.assetType.create({ data: { name: `${tag} mtype B` } });
    const source = await prisma.manufacturer.create({ data: { name: `${tag} brand src` } });
    const target = await prisma.manufacturer.create({ data: { name: `${tag} brand dst` } });
    const model = await prisma.model.create({ data: { name: `${tag} mmodel`, typeId: typeA.id, manufacturerId: source.id } });
    const asset = await prisma.asset.create({ data: { locationId, typeId: typeA.id, manufacturerId: source.id, modelId: model.id } });
    const stock = await prisma.stockItem.create({ data: { typeId: typeA.id, manufacturerId: source.id, modelId: model.id } });
    const colliding = await prisma.assetTypeManufacturerTemplate.create({ data: { typeId: typeA.id, manufacturerId: source.id, scrapeTargetTemplate: "__address__=src" } });
    const kept = await prisma.assetTypeManufacturerTemplate.create({ data: { typeId: typeA.id, manufacturerId: target.id, scrapeTargetTemplate: "__address__=dst" } });
    const movedTemplate = await prisma.assetTypeManufacturerTemplate.create({ data: { typeId: typeB.id, manufacturerId: source.id, scrapeTargetTemplate: "__address__=b" } });

    const { POST } = await import("@/app/api/manufacturers/[id]/merge/route");
    const res = await POST(mergeRequest(`manufacturers/${source.id}`, target.id), params(source.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetsMoved: 1, stockItemsMoved: 1, modelsMoved: 1, modelsFolded: 0 });

    expect(await prisma.manufacturer.findUnique({ where: { id: source.id } })).toBeNull();
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).manufacturerId).toBe(target.id);
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })).manufacturerId).toBe(target.id);
    expect((await prisma.model.findUniqueOrThrow({ where: { id: model.id } })).manufacturerId).toBe(target.id);
    expect(await prisma.assetTypeManufacturerTemplate.findUnique({ where: { id: colliding.id } })).toBeNull();
    expect((await prisma.assetTypeManufacturerTemplate.findUniqueOrThrow({ where: { id: kept.id } })).scrapeTargetTemplate).toBe("__address__=dst");
    expect((await prisma.assetTypeManufacturerTemplate.findUniqueOrThrow({ where: { id: movedTemplate.id } })).manufacturerId).toBe(target.id);

    expect(await auditFor(source.id)).toMatchObject([{ action: "DELETE", entityType: "Manufacturer" }]);
  });

  it("cross-type model merge repoints assets and stock and carries the target's type onto them", async () => {
    const typeA = await prisma.assetType.create({ data: { name: `${tag} xtype A` } });
    const typeB = await prisma.assetType.create({ data: { name: `${tag} xtype B` } });
    const source = await prisma.model.create({ data: { name: `${tag} xmodel src`, typeId: typeA.id } });
    const target = await prisma.model.create({ data: { name: `${tag} xmodel dst`, typeId: typeB.id } });
    const asset = await prisma.asset.create({ data: { locationId, typeId: typeA.id, modelId: source.id } });
    const stock = await prisma.stockItem.create({ data: { typeId: typeA.id, modelId: source.id } });

    const { POST } = await import("@/app/api/models/[id]/merge/route");
    const res = await POST(mergeRequest(`models/${source.id}`, target.id), params(source.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetsMoved: 1, stockItemsMoved: 1 });

    expect(await prisma.model.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ modelId: target.id, typeId: typeB.id });
    expect(await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({ modelId: target.id, typeId: typeB.id });

    const audit = await auditFor(source.id);
    expect(audit).toMatchObject([{ action: "DELETE", entityType: "Model" }]);
    expect(JSON.parse(audit[0].detail!).snapshot["Retyped to"]).toBe(typeB.id);
  });
});

describe.skipIf(enabled)("catalog merges (integration)", () => {
  it.skip("set RUN_DB_TESTS=1 to run against a real MySQL", () => {});
});
