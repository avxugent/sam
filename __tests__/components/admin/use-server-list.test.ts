import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

import { useServerList } from "@/components/admin/use-server-list";

beforeEach(() => vi.clearAllMocks());

describe("useServerList", () => {
  it("starts from the initial list", () => {
    const initial = [1, 2];
    const { result } = renderHook(() => useServerList(initial));
    expect(result.current[0]).toEqual([1, 2]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("applies a change locally and refreshes the server data", () => {
    const initial = [1, 2];
    const { result } = renderHook(() => useServerList(initial));
    act(() => result.current[1]((current) => [...current, 3]));
    expect(result.current[0]).toEqual([1, 2, 3]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-syncs when the initial list prop changes", () => {
    const { result, rerender } = renderHook(({ list }) => useServerList(list), { initialProps: { list: ["a"] } });
    act(() => result.current[1]((current) => [...current, "local"]));
    expect(result.current[0]).toEqual(["a", "local"]);
    rerender({ list: ["a", "b", "c"] });
    expect(result.current[0]).toEqual(["a", "b", "c"]);
  });

  it("keeps local changes while the same initial list is passed again", () => {
    const list = ["a"];
    const { result, rerender } = renderHook(({ list }) => useServerList(list), { initialProps: { list } });
    act(() => result.current[1]((current) => current.filter((x) => x !== "a")));
    rerender({ list });
    expect(result.current[0]).toEqual([]);
  });
});
