// @vitest-environment node
/**
 * Opt-in integration test for the recursive location-tree SQL in
 * lib/location-path.ts (also used by the search and location-delete routes),
 * which the unit tests only check against a mocked $queryRaw. Runs against a real MySQL (e.g. docker-compose.dev.yml) when
 * RUN_DB_TESTS=1 and DB_* point at it:
 *
 *   DB_HOST=localhost DB_NAME=samdb DB_USER=sam DB_PASSWORD=… npm run test:integration
 *
 * It creates a small, uniquely named location tree with one asset type and
 * asset, and deletes everything it created afterwards.
 *
 * MySQL 8 with caching_sha2_password and no TLS rejects the first login after a
 * server restart ("RSA public key is not available"); log in once over the
 * socket (e.g. `docker exec sam-db-dev mysql -u sam -p samdb -e 'SELECT 1'`)
 * to warm the server's auth cache.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("location-path SQL (integration)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let lib: typeof import("@/lib/location-path");
  const tag = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids = { campus: "", building: "", room: "", typeId: "" };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    lib = await import("@/lib/location-path");
    const campus = await prisma.location.create({ data: { name: `${tag} campus` } });
    const building = await prisma.location.create({ data: { name: `${tag} building`, parentId: campus.id } });
    const room = await prisma.location.create({ data: { name: `${tag} room`, parentId: building.id, fiNumber: `99.99.${String(Date.now()).slice(-3)}.001` } });
    const type = await prisma.assetType.create({ data: { name: `${tag} type` } });
    await prisma.asset.create({ data: { locationId: room.id, typeId: type.id, quantity: 3 } });
    Object.assign(ids, { campus: campus.id, building: building.id, room: room.id, typeId: type.id });
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { typeId: ids.typeId } });
    // Leaf first: parentId is a foreign key.
    for (const id of [ids.room, ids.building, ids.campus]) {
      if (id) await prisma.location.deleteMany({ where: { id } });
    }
    await prisma.assetType.deleteMany({ where: { id: ids.typeId } });
    await prisma.$disconnect();
  });

  it("getLocationPath returns the ancestors root → leaf", async () => {
    const path = await lib.getLocationPath(ids.room);
    expect(path.map((p) => p.id)).toEqual([ids.campus, ids.building, ids.room]);
  });

  it("getAllDescendantLocationIds returns every descendant but not the root", async () => {
    expect((await lib.getAllDescendantLocationIds(ids.campus)).sort()).toEqual([ids.building, ids.room].sort());
    expect(await lib.getAllDescendantLocationIds(ids.room)).toEqual([]);
  });

  it("getRecursiveAssetCounts sums installed quantity up the tree", async () => {
    const counts = await lib.getRecursiveAssetCounts();
    expect(counts[ids.room]).toBe(3);
    expect(counts[ids.building]).toBe(3);
    expect(counts[ids.campus]).toBe(3);
  });

  it("getRecursiveAssetCounts scoped to root ids counts only those roots (search)", async () => {
    expect(await lib.getRecursiveAssetCounts([ids.building, ids.room])).toEqual({ [ids.building]: 3, [ids.room]: 3 });
  });

  it("getSubtreeIdsDeepestFirst lists the subtree in delete order", async () => {
    expect(await lib.getSubtreeIdsDeepestFirst(ids.campus)).toEqual([ids.room, ids.building, ids.campus]);
  });
});

describe.skipIf(enabled)("location-path SQL (integration)", () => {
  it.skip("set RUN_DB_TESTS=1 to run against a real MySQL", () => {});
});
