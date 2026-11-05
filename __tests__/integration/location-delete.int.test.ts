// @vitest-environment node
/**
 * Opt-in integration test for DELETE /api/locations/[id] against a real MySQL
 * (see locations-path.int.test.ts for how to run it): the cascade deletes the
 * subtree deepest-first in one transaction (the parent FK is RESTRICT), and
 * the guards leave the tree untouched. Calls the route handler as an admin
 * (mocked auth(); only admins delete a location with sub-locations). Every row is named with a unique prefix and removed
 * afterwards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, leftovers, newTag, testSession } from "./fixtures";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("location subtree delete (integration)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let DELETE: typeof import("@/app/api/locations/[id]/route").DELETE;
  const tag = newTag("locdel");
  let typeId = "";
  let modelId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(testSession(tag, "ADMIN") as never);
    ({ DELETE } = await import("@/app/api/locations/[id]/route"));
    typeId = (await prisma.assetType.create({ data: { name: `${tag} type` } })).id;
    modelId = (await prisma.model.create({ data: { name: `${tag} model`, typeId } })).id;
  });

  afterAll(async () => {
    await cleanup(prisma, tag);
    expect(await leftovers(prisma, tag)).toBe(0);
    await prisma.$disconnect();
  });

  /** campus → building → (room A with an asset, room B) */
  async function tree(name: string) {
    const campus = await prisma.location.create({ data: { name: `${tag} ${name} campus` } });
    const building = await prisma.location.create({ data: { name: `${tag} ${name} building`, parentId: campus.id } });
    const roomA = await prisma.location.create({ data: { name: `${tag} ${name} room A`, parentId: building.id } });
    const roomB = await prisma.location.create({ data: { name: `${tag} ${name} room B`, parentId: building.id } });
    const asset = await prisma.asset.create({
      data: { locationId: roomA.id, typeId, macAddresses: { create: [{ address: "02:00:00:00:01:01" }] } },
    });
    return { all: [campus.id, building.id, roomA.id, roomB.id], campus, building, roomB, asset };
  }

  const del = (id: string, cascade: boolean) =>
    DELETE(new NextRequest(`http://localhost/api/locations/${id}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });

  it("cascade deletes the whole subtree with its assets and audits the root", async () => {
    const t = await tree("cascade");

    const res = await del(t.campus.id, true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await prisma.location.count({ where: { id: { in: t.all } } })).toBe(0);
    expect(await prisma.asset.findUnique({ where: { id: t.asset.id } })).toBeNull();
    expect(await prisma.macAddress.count({ where: { assetId: t.asset.id } })).toBe(0);
    expect(await prisma.auditLog.findMany({ where: { userId: `${tag}-user`, entityId: t.campus.id } })).toMatchObject([
      { action: "DELETE", entityType: "Location", entityName: t.campus.name },
    ]);
  });

  it("cascade on a mid-level node leaves its ancestors alone", async () => {
    const t = await tree("mid");

    expect((await del(t.building.id, true)).status).toBe(200);
    expect(await prisma.location.findMany({ where: { id: { in: t.all } }, select: { id: true } })).toEqual([{ id: t.campus.id }]);
  });

  it("without cascade a location with children is refused and nothing is deleted", async () => {
    const t = await tree("nocascade");

    const res = await del(t.campus.id, false);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("hasSublocations");
    expect(await prisma.location.count({ where: { id: { in: t.all } } })).toBe(4);
    expect(await prisma.asset.count({ where: { id: t.asset.id } })).toBe(1);
  });

  it("stock stored anywhere in the subtree blocks the delete", async () => {
    const t = await tree("stock");
    await prisma.stockItem.create({ data: { typeId, modelId, locationId: t.roomB.id } });

    const res = await del(t.campus.id, true);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("hasStock");
    expect(await prisma.location.count({ where: { id: { in: t.all } } })).toBe(4);
  });
});

describe.skipIf(enabled)("location subtree delete (integration)", () => {
  it.skip("set RUN_DB_TESTS=1 to run against a real MySQL", () => {});
});
