import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { MergeConfirmDialog } from "@/components/admin/merge-confirm-dialog";
import { useCatalogMerge } from "@/components/admin/use-catalog-merge";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCatalogMerge()", () => {
  it("POSTs the merge and returns the counts", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, assetsMoved: 3, stockItemsMoved: 1 })));
    const { result } = renderHook(() => useCatalogMerge("models"));
    let merged;
    await act(async () => { merged = await result.current.merge("m1", "m2"); });

    expect(mockFetch).toHaveBeenCalledWith("/api/models/m1/merge", expect.objectContaining({ method: "POST", body: JSON.stringify({ targetId: "m2" }) }));
    expect(merged).toEqual({ ok: true, assetsMoved: 3, stockItemsMoved: 1 });
    expect(result.current.summary(merged!)).toBe('mergeSummary:{"assets":3,"stock":1}');
    expect(result.current.merging).toBe(false);
  });

  it("toasts the API error and returns null", async () => {
    mockFetch.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const { result } = renderHook(() => useCatalogMerge("manufacturers"));
    let merged;
    await act(async () => { merged = await result.current.merge("a", "b"); });
    expect(merged).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "somethingWentWrong", variant: "destructive" }));
  });
});

describe("<MergeConfirmDialog />", () => {
  it("confirms and cancels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <MergeConfirmDialog open title="Merge" description="A into B" cancelLabel="Cancel" confirmLabel="Merge now" merging={false} onCancel={onCancel} onConfirm={onConfirm} />
    );
    expect(screen.getByText("A into B")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Merge now" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it("disables the confirm button while merging", () => {
    render(
      <MergeConfirmDialog open title="Merge" description="x" cancelLabel="Cancel" confirmLabel="Merge now" merging onCancel={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Merge now" })).toBeDisabled();
  });
});
