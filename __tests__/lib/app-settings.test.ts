import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { appSetting: { findMany: vi.fn(), upsert: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { readSettings, writeSettings } from "@/lib/app-settings";

beforeEach(() => vi.clearAllMocks());

describe("readSettings()", () => {
  it("returns a key → value map for the requested keys", async () => {
    vi.mocked(prisma.appSetting.findMany).mockResolvedValue([{ key: "app.title", value: "SAM" }] as never);
    expect(await readSettings(["app.title", "missing"])).toEqual({ "app.title": "SAM" });
    expect(prisma.appSetting.findMany).toHaveBeenCalledWith({ where: { key: { in: ["app.title", "missing"] } } });
  });
});

describe("writeSettings()", () => {
  it("upserts only defined values and returns them", async () => {
    const written = await writeSettings({ a: "1", b: undefined, c: "" });
    expect(written).toEqual({ a: "1", c: "" });
    expect(vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => arg.where.key)).toEqual(["a", "c"]);
  });
});
