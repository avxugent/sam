import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

import { useLocationOptions } from "@/components/inventory/use-location-options";

const TREE = [
  { id: "c", name: "Campus", parentId: null, children: [{ id: "r", name: "Room", parentId: "c", children: [] }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => TREE }) as Response) as never;
});

describe("useLocationOptions", () => {
  it("does not fetch while disabled", () => {
    renderHook(() => useLocationOptions(false));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads the tree as flat options when enabled", async () => {
    const { result } = renderHook(() => useLocationOptions(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locations.map((l) => l.id)).toEqual(["c", "r"]);
  });

  it("applies a custom shaping of the tree", async () => {
    const { result } = renderHook(() => useLocationOptions(true, (tree) => [{ id: tree[0].id, name: "only", path: "only" } as never]));
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
  });

  it("toasts and stays empty when the request fails", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }) as Response) as never;
    const { result } = renderHook(() => useLocationOptions(true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "loadLocationsFailed" })));
    expect(result.current.locations).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
