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

beforeEach(() => vi.clearAllMocks());

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

describe("<BulkReturnToStockDialog />", () => {
  it("submits the selected ids with no extra fields", async () => {
    const user = userEvent.setup();
    const onComplete = renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ succeeded: ["a1", "a2"], failed: [] }));

    await user.click(screen.getByRole("button", { name: "returnToStock" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/assets/bulk-return-to-stock",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ids: ["a1", "a2"] }) })
    );
    expect(onComplete).toHaveBeenCalledWith({ succeeded: ["a1", "a2"], failed: [] });
  });

  it("shows a results view listing skipped assets on partial failure", async () => {
    const user = userEvent.setup();
    renderDialog();
    mockFetch.mockResolvedValue(
      jsonResp({ succeeded: ["a1"], failed: [{ id: "a2", reason: "MISSING_MODEL" }] })
    );

    await user.click(screen.getByRole("button", { name: "returnToStock" }));

    expect(await screen.findByText("bulkReturnToStockResultsTitle")).toBeInTheDocument();
    expect(screen.getByText("a2")).toBeInTheDocument();
    expect(screen.getByText("bulkSkipReason.MISSING_MODEL")).toBeInTheDocument();
  });

  it("shows a destructive toast when the request itself fails", async () => {
    const user = userEvent.setup();
    renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ error: "Boom" }, false));

    await user.click(screen.getByRole("button", { name: "returnToStock" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Boom" })
      )
    );
  });
});
