import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { paginate, useRowSelection, useTableSort } from "@/components/ui/use-row-selection";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("useRowSelection", () => {
  it("toggles single rows and all visible rows", () => {
    const { result } = renderHook(() => useRowSelection());
    act(() => result.current.toggleRow("a"));
    expect(result.current.someSelectedIn(rows)).toBe(true);
    act(() => result.current.toggleAll(rows));
    expect(result.current.allSelectedIn(rows)).toBe(true);
    act(() => result.current.toggleAll(rows));
    expect(result.current.selected.size).toBe(0);
    act(() => result.current.toggleRow("b"));
    act(() => result.current.toggleRow("b"));
    expect(result.current.selected.size).toBe(0);
  });

  it("never reports 'all' for an empty list", () => {
    const { result } = renderHook(() => useRowSelection());
    expect(result.current.allSelectedIn([])).toBe(false);
  });
});

describe("paginate()", () => {
  it("clamps the page to the last one", () => {
    expect(paginate(rows, 5, 2)).toEqual({ totalPages: 2, safePage: 2, pageRows: [{ id: "c" }] });
    expect(paginate([], 1, 10)).toEqual({ totalPages: 1, safePage: 1, pageRows: [] });
  });
});

describe("useTableSort", () => {
  type Row = { name: string; qty: number };
  const items: Row[] = [{ name: "b", qty: 10 }, { name: "a", qty: 9 }, { name: "c", qty: 100 }];
  const keys = { name: (r: Row) => r.name, qty: (r: Row) => r.qty };
  const names = (rs: Row[]) => rs.map((r) => r.name);

  it("leaves rows unsorted when no initial column is given", () => {
    const { result } = renderHook(() => useTableSort(items, keys));
    expect(result.current.sortCol).toBeNull();
    expect(result.current.sorted).toBe(items);
  });

  it("sorts by the initial column and direction", () => {
    const { result } = renderHook(() => useTableSort(items, keys, "name", "desc"));
    expect(names(result.current.sorted)).toEqual(["c", "b", "a"]);
  });

  it("flips the active column and resets to ascending on a new column", () => {
    const { result } = renderHook(() => useTableSort(items, keys, "name"));
    expect(names(result.current.sorted)).toEqual(["a", "b", "c"]);
    act(() => result.current.handleSort("name"));
    expect(result.current.sortDir).toBe("desc");
    expect(names(result.current.sorted)).toEqual(["c", "b", "a"]);
    act(() => result.current.handleSort("qty"));
    expect(result.current.sortCol).toBe("qty");
    expect(result.current.sortDir).toBe("asc");
  });

  it("compares numeric keys as numbers, not strings", () => {
    const { result } = renderHook(() => useTableSort(items, keys, "qty"));
    expect(result.current.sorted.map((r) => r.qty)).toEqual([9, 10, 100]);
  });
});
