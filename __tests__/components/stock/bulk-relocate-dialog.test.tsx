import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { BulkRelocateDialog } from "@/components/stock/bulk-relocate-dialog";

function jsonResp(data: unknown, ok = true) {
  return { ok, json: async () => data };
}

const LOCATIONS = [
  { id: "loc1", name: "Room A", parentId: null, _count: { stockItems: 1 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/locations") return Promise.resolve(jsonResp(LOCATIONS));
    return Promise.resolve(jsonResp({}));
  });
});

function renderDialog(onComplete = vi.fn()) {
  render(
    <BulkRelocateDialog
      open={true}
      onOpenChange={vi.fn()}
      itemIds={["s1", "s2"]}
      onComplete={onComplete}
    />
  );
  return onComplete;
}

describe("<BulkRelocateDialog />", () => {
  it("fetches locations and lets you pick one, then submits", async () => {
    const user = userEvent.setup();
    const onComplete = renderDialog();

    await user.click(await screen.findByText("Room A"));
    mockFetch.mockImplementationOnce((url: string) => {
      if (url === "/api/stock/bulk-relocate") {
        return Promise.resolve(jsonResp({ succeeded: ["s1", "s2"], failed: [] }));
      }
      return Promise.resolve(jsonResp({}));
    });
    await user.click(screen.getByRole("button", { name: "bulkRelocateConfirm" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stock/bulk-relocate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["s1", "s2"], locationId: "loc1" }),
      })
    );
    expect(onComplete).toHaveBeenCalledWith({ succeeded: ["s1", "s2"], failed: [] });
  });

  it("submits null locationId for Unassigned", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Room A");

    mockFetch.mockImplementationOnce((url: string) => {
      if (url === "/api/stock/bulk-relocate") {
        return Promise.resolve(jsonResp({ succeeded: ["s1", "s2"], failed: [] }));
      }
      return Promise.resolve(jsonResp({}));
    });
    await user.click(screen.getByRole("button", { name: "bulkRelocateConfirm" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stock/bulk-relocate",
      expect.objectContaining({ body: JSON.stringify({ ids: ["s1", "s2"], locationId: null }) })
    );
  });

  it("shows a results view listing skipped items on partial failure", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Room A");

    mockFetch.mockImplementationOnce((url: string) => {
      if (url === "/api/stock/bulk-relocate") {
        return Promise.resolve(
          jsonResp({ succeeded: ["s1"], failed: [{ id: "s2", reason: "NOT_FOUND" }] })
        );
      }
      return Promise.resolve(jsonResp({}));
    });
    await user.click(screen.getByRole("button", { name: "bulkRelocateConfirm" }));

    expect(await screen.findByText("bulkRelocateResultsTitle")).toBeInTheDocument();
    expect(screen.getByText("s2")).toBeInTheDocument();
    // Translated, not the raw code.
    expect(screen.getByText("bulkSkipReason.NOT_FOUND")).toBeInTheDocument();
  });
});
