import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTypeScopedManufacturers } from "@/components/inventory/use-type-scoped-manufacturers";

type Pending = { url: string; resolve: (list: { id: string; name: string }[]) => void };
let pending: Pending[] = [];

beforeEach(() => {
  pending = [];
  global.fetch = vi.fn(
    (url: string) =>
      new Promise((resolve) => {
        pending.push({ url, resolve: (list) => resolve({ ok: true, json: async () => list } as Response) });
      })
  ) as never;
});

function setup(initial: { typeId: string; manufacturerId: string }) {
  const onSelectionInvalid = vi.fn();
  const hook = renderHook((props) => useTypeScopedManufacturers({ open: true, onSelectionInvalid, ...props }), {
    initialProps: initial,
  });
  return { ...hook, onSelectionInvalid };
}

describe("useTypeScopedManufacturers", () => {
  it("ignores a response that arrives after a newer request started", async () => {
    const { result, rerender } = setup({ typeId: "t1", manufacturerId: "" });
    rerender({ typeId: "t2", manufacturerId: "" });
    expect(pending.map((p) => p.url)).toEqual(["/api/manufacturers?typeId=t1", "/api/manufacturers?typeId=t2"]);

    await act(async () => pending[1].resolve([{ id: "m2", name: "For t2" }]));
    await act(async () => pending[0].resolve([{ id: "m1", name: "Stale t1" }]));
    expect(result.current).toEqual([{ id: "m2", name: "For t2" }]);
  });

  it("keeps the selection on the first load, reports it invalid after a later type change", async () => {
    const { rerender, onSelectionInvalid } = setup({ typeId: "t1", manufacturerId: "m9" });
    await act(async () => pending[0].resolve([{ id: "m1", name: "A" }]));
    expect(onSelectionInvalid).not.toHaveBeenCalled();

    rerender({ typeId: "t2", manufacturerId: "m9" });
    await act(async () => pending[1].resolve([{ id: "m1", name: "A" }]));
    await waitFor(() => expect(onSelectionInvalid).toHaveBeenCalledTimes(1));
  });
});
