import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { paginate, useRowSelection } from "@/components/ui/use-row-selection";

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
