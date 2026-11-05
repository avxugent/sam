// @vitest-environment node
/**
 * Opt-in integration test for the status-guarded writes in
 * lib/assets/transitions.ts (decommission, repair, reinstate, return to stock,
 * deploy from stock) against a real MySQL; see locations-path.int.test.ts for
 * how to run it. The unit tests mock Prisma, so only here does the
 * `where: { id, status }` / `{ id, quantity }` guard actually raise P2025 and
 * roll back the surrounding transaction. Every row is named with a unique
 * prefix and removed afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cleanup, leftovers, newTag, testFiNumber, testSession } from "./fixtures";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("asset transitions (integration)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let lib: typeof import("@/lib/assets/transitions");
  const tag = newTag("transitions");
  const session = testSession(tag, "EDITOR");
  const req = new Request("http://localhost/api/assets");
  const ids = { room: "", store: "", typeId: "", modelId: "" };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    lib = await import("@/lib/assets/transitions");
    const room = await prisma.location.create({ data: { name: `${tag} room`, fiNumber: testFiNumber("98.98") } });
    const store = await prisma.location.create({ data: { name: `${tag} store` } });
    const type = await prisma.assetType.create({ data: { name: `${tag} type` } });
    const model = await prisma.model.create({ data: { name: `${tag} model`, typeId: type.id } });
    Object.assign(ids, { room: room.id, store: store.id, typeId: type.id, modelId: model.id });
  });

  afterAll(async () => {
    await cleanup(prisma, tag);
    expect(await leftovers(prisma, tag)).toBe(0);
    await prisma.$disconnect();
  });

  const newAsset = (data: Record<string, unknown> = {}) =>
    prisma.asset.create({ data: { locationId: ids.room, typeId: ids.typeId, modelId: ids.modelId, ...data } });
  const auditFor = (entityId: string) => prisma.auditLog.findMany({ where: { userId: session.user.id, entityId } });

  it("decommissionAsset writes the disposal evidence and audits; a stale status is a no-op", async () => {
    const asset = await newAsset();
    const existing = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, select: lib.DECOMMISSION_SELECT });

    const done = await lib.decommissionAsset(req, session, existing, { note: "broken", disposalMethod: "WIPED" });
    expect(done).not.toBeNull();
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row).toMatchObject({
      status: "DECOMMISSIONED",
      disposalMethod: "WIPED",
      decommissionNote: "broken",
      decommissionedById: session.user.id,
      lastLocationName: `${tag} room`,
    });
    expect(row.decommissionedAt).toBeInstanceOf(Date);
    expect(await auditFor(asset.id)).toMatchObject([{ action: "UPDATE", entityType: "Asset", lineageId: asset.lineageId }]);

    // Same request again: the guard still expects INSTALLED, the row is DECOMMISSIONED.
    expect(await lib.decommissionAsset(req, session, existing, { disposalMethod: "DESTROYED" })).toBeNull();
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).disposalMethod).toBe("WIPED");
    expect(await auditFor(asset.id)).toHaveLength(1);
  });

  it("reinstateAsset clears the decommission and is guarded by the status", async () => {
    const asset = await newAsset({ status: "DECOMMISSIONED", disposalMethod: "RESOLD", decommissionedAt: new Date() });
    const existing = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, select: lib.REPAIR_SELECT });

    expect(await lib.reinstateAsset(req, session, existing)).not.toBeNull();
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({
      status: "INSTALLED",
      disposalMethod: null,
      decommissionedAt: null,
    });
    expect(await lib.reinstateAsset(req, session, existing)).toBeNull();
  });

  it("sendAssetForRepair sets IN_REPAIR and audits; a stale status is a no-op", async () => {
    const asset = await newAsset();
    const existing = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, select: lib.REPAIR_SELECT });

    expect(await lib.sendAssetForRepair(req, session, existing, { note: "screen" })).not.toBeNull();
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({
      status: "IN_REPAIR",
      repairNote: "screen",
      sentForRepairById: session.user.id,
    });
    expect(await lib.sendAssetForRepair(req, session, existing, { note: "again" })).toBeNull();
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).repairNote).toBe("screen");
    expect(await auditFor(asset.id)).toHaveLength(1);
  });

  it("returnAssetToStock replaces the asset by a stock item with the same lineage and identity", async () => {
    const asset = await newAsset({
      serialNumber: `${tag}-sn`,
      hostname: `${tag}-host`,
      macAddresses: { create: [{ address: "02:00:00:00:00:01" }] },
      customFields: { create: [{ key: "rack", value: "A1" }] },
    });
    const candidate = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: lib.RETURN_TO_STOCK_INCLUDE });

    const item = await lib.returnAssetToStock(req, session, { ...candidate, typeId: ids.typeId, modelId: ids.modelId }, { locationId: ids.store });
    expect(item).not.toBeNull();
    expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull();
    expect(await prisma.macAddress.count({ where: { assetId: asset.id } })).toBe(0);
    const stock = await prisma.stockItem.findUniqueOrThrow({ where: { id: item!.id } });
    expect(stock).toMatchObject({ lineageId: asset.lineageId, locationId: ids.store, serialNumber: `${tag}-sn`, quantity: 1 });
    expect(JSON.parse(stock.metadata!)).toMatchObject({
      hostname: `${tag}-host`,
      macAddresses: [{ address: "02:00:00:00:00:01" }],
      customFields: [{ key: "rack", value: "A1" }],
    });
    const audit = await prisma.auditLog.findMany({ where: { userId: session.user.id, lineageId: asset.lineageId } });
    expect(audit.map((a) => `${a.action} ${a.entityType}`).sort()).toEqual(["CREATE StockItem", "DELETE Asset"]);
  });

  it("returnAssetToStock rolls back the stock item when the asset's status changed", async () => {
    const asset = await newAsset();
    const candidate = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: lib.RETURN_TO_STOCK_INCLUDE });
    await prisma.asset.update({ where: { id: asset.id }, data: { status: "IN_REPAIR" } });

    const item = await lib.returnAssetToStock(req, session, { ...candidate, typeId: ids.typeId, modelId: ids.modelId }, { locationId: ids.store });
    expect(item).toBeNull();
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe("IN_REPAIR");
    expect(await prisma.stockItem.count({ where: { lineageId: asset.lineageId } })).toBe(0);
    expect(await auditFor(asset.id)).toHaveLength(0);
  });

  it("deployStockItem splits a batch: assets created, stock quantity decremented", async () => {
    const stock = await prisma.stockItem.create({ data: { typeId: ids.typeId, modelId: ids.modelId, quantity: 3, locationId: ids.store } });
    const candidate = await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id }, include: lib.DEPLOY_INCLUDE });

    const created = await lib.deployStockItem(req, session, candidate, {
      location: { id: ids.room, name: `${tag} room` },
      quantity: 2,
      serialNumbers: [`${tag}-s1`, `${tag}-s2`],
    });
    expect(created).toHaveLength(2);
    expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(1);
    const assets = await prisma.asset.findMany({ where: { id: { in: created!.map((c) => c.id) } } });
    expect(assets.map((a) => a.serialNumber).sort()).toEqual([`${tag}-s1`, `${tag}-s2`]);
    expect(assets.every((a) => a.locationId === ids.room && a.lineageId !== stock.lineageId)).toBe(true);
    expect(await auditFor(stock.id)).toMatchObject([{ action: "UPDATE", entityType: "StockItem" }]);
  });

  it("deployStockItem of the last single unit deletes the stock item and restores its identity", async () => {
    const stock = await prisma.stockItem.create({
      data: {
        typeId: ids.typeId,
        modelId: ids.modelId,
        quantity: 1,
        metadata: JSON.stringify({ hostname: `${tag}-back`, macAddresses: [{ address: "02:00:00:00:00:02" }] }),
      },
    });
    const candidate = await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id }, include: lib.DEPLOY_INCLUDE });

    const created = await lib.deployStockItem(req, session, candidate, { location: { id: ids.room, name: `${tag} room` }, quantity: 1 });
    expect(created).toHaveLength(1);
    expect(await prisma.stockItem.findUnique({ where: { id: stock.id } })).toBeNull();
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: created![0].id }, include: { macAddresses: true } });
    expect(asset).toMatchObject({ lineageId: stock.lineageId, hostname: `${tag}-back` });
    expect(asset.macAddresses.map((m) => m.address)).toEqual(["02:00:00:00:00:02"]);
    expect(await auditFor(stock.id)).toMatchObject([{ action: "DELETE", entityType: "StockItem" }]);
  });

  it("deployStockItem with a stale quantity raises P2025 inside the transaction: nothing is written", async () => {
    const stock = await prisma.stockItem.create({ data: { typeId: ids.typeId, modelId: ids.modelId, quantity: 3 } });
    const candidate = await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id }, include: lib.DEPLOY_INCLUDE });
    // Another request drew a unit in the meantime.
    await prisma.stockItem.update({ where: { id: stock.id }, data: { quantity: 2 } });

    for (const quantity of [1, 3]) {
      // 1 → guarded update, 3 → guarded delete; both lose the race.
      const assetsBefore = await prisma.asset.count({ where: { locationId: ids.room } });
      expect(await lib.deployStockItem(req, session, candidate, { location: { id: ids.room, name: `${tag} room` }, quantity })).toBeNull();
      expect(await prisma.asset.count({ where: { locationId: ids.room } })).toBe(assetsBefore);
      expect((await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(2);
    }
    expect(await auditFor(stock.id)).toHaveLength(0);
  });
});

describe.skipIf(enabled)("asset transitions (integration)", () => {
  it.skip("set RUN_DB_TESTS=1 to run against a real MySQL", () => {});
});
