import { describe, it, expect, vi } from "vitest";
import { reassignModels } from "@/lib/models/reassign";

function txWith(sources: object[], existing: (where: { name: string }) => object | null) {
  return {
    model: {
      findMany: vi.fn().mockResolvedValue(sources),
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => existing(where)),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asset: { updateMany: vi.fn() },
    stockItem: { updateMany: vi.fn() },
  };
}

describe("reassignModels", () => {
  it("moves a model whose name is free under the target", async () => {
    const tx = txWith([{ id: "md1", name: "X1", typeId: "t1", manufacturerId: "m1" }], () => null);
    const result = await reassignModels(tx as never, { typeId: "t1" }, { typeId: "t2" });

    expect(result).toEqual({ modelsMoved: 1, modelsFolded: 0 });
    expect(tx.model.findFirst).toHaveBeenCalledWith({ where: { typeId: "t2", manufacturerId: "m1", name: "X1" }, select: { id: true } });
    expect(tx.model.update).toHaveBeenCalledWith({ where: { id: "md1" }, data: { typeId: "t2" } });
    expect(tx.model.delete).not.toHaveBeenCalled();
  });

  it("folds a model into the target's same-named model", async () => {
    const tx = txWith([{ id: "md1", name: "X1", typeId: "t1", manufacturerId: "m1" }], () => ({ id: "md9" }));
    const result = await reassignModels(tx as never, { manufacturerId: "m1" }, { manufacturerId: "m2" });

    expect(result).toEqual({ modelsMoved: 0, modelsFolded: 1 });
    expect(tx.model.findFirst).toHaveBeenCalledWith({ where: { typeId: "t1", manufacturerId: "m2", name: "X1" }, select: { id: true } });
    expect(tx.asset.updateMany).toHaveBeenCalledWith({ where: { modelId: "md1" }, data: { modelId: "md9" } });
    expect(tx.stockItem.updateMany).toHaveBeenCalledWith({ where: { modelId: "md1" }, data: { modelId: "md9" } });
    expect(tx.model.delete).toHaveBeenCalledWith({ where: { id: "md1" } });
    expect(tx.model.update).not.toHaveBeenCalled();
  });

  it("handles a mix of moved and folded models", async () => {
    const tx = txWith(
      [
        { id: "a", name: "Dup", typeId: "t1", manufacturerId: null },
        { id: "b", name: "Free", typeId: "t1", manufacturerId: null },
      ],
      (where) => (where.name === "Dup" ? { id: "z" } : null)
    );
    expect(await reassignModels(tx as never, { typeId: "t1" }, { typeId: "t2" })).toEqual({ modelsMoved: 1, modelsFolded: 1 });
  });
});
