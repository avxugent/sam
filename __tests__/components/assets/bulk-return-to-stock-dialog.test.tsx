import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { BulkReturnToStockDialog } from "@/components/assets/bulk-return-to-stock-dialog";

function jsonResp(data: unknown, ok = true) {
  return { ok, json: async () => data };
}

const LOCATION_TREE = [
  { id: "loc-1", name: "Room 101", parentId: null, _count: { stockItems: 1 } },
  { id: "loc-2", name: "Room 202", parentId: null, _count: { stockItems: 0 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/locations") return Promise.resolve(jsonResp(LOCATION_TREE));
    return Promise.resolve(jsonResp({}));
  });
});

function renderDialog(onComplete = vi.fn()) {
  render(
    <BulkReturnToStockDialog
      open={true}
      onOpenChange={vi.fn()}
      assetIds={["a1", "a2"]}
      onComplete={onComplete}
    />
  );
  return onComplete;
}

async function pickLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Room 101"));
}

describe("<BulkReturnToStockDialog />", () => {
  it("confirm is disabled until a location is picked, then submits ids + locationId", async () => {
    const user = userEvent.setup();
    const onComplete = renderDialog();

    const confirmBtn = screen.getByRole("button", { name: "returnToStock" });
    expect(confirmBtn).toBeDisabled();

    await pickLocation(user);
    expect(confirmBtn).not.toBeDisabled();

    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp(LOCATION_TREE));
      return Promise.resolve(jsonResp({ succeeded: ["a1", "a2"], failed: [] }));
    });

    await user.click(confirmBtn);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/assets/bulk-return-to-stock",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["a1", "a2"], locationId: "loc-1" }),
      })
    );
    expect(onComplete).toHaveBeenCalledWith({ succeeded: ["a1", "a2"], failed: [] });
  });

  it("only locations already holding stock show by default; 'show all locations' reveals the rest", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Room 101");
    expect(screen.queryByText("Room 202")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "showAllLocations" }));
    expect(screen.getByText("Room 202")).toBeInTheDocument();
  });

  it("shows a results view listing skipped assets on partial failure", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickLocation(user);
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp(LOCATION_TREE));
      return Promise.resolve(
        jsonResp({ succeeded: ["a1"], failed: [{ id: "a2", reason: "MISSING_MODEL" }] })
      );
    });

    await user.click(screen.getByRole("button", { name: "returnToStock" }));

    expect(await screen.findByText("bulkReturnToStockResultsTitle")).toBeInTheDocument();
    expect(screen.getByText("a2")).toBeInTheDocument();
    expect(screen.getByText("bulkSkipReason.MISSING_MODEL")).toBeInTheDocument();
  });

  it("shows a destructive toast when the request itself fails", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickLocation(user);
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp(LOCATION_TREE));
      return Promise.resolve(jsonResp({ error: "Boom" }, false));
    });

    await user.click(screen.getByRole("button", { name: "returnToStock" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Boom" })
      )
    );
  });
});
