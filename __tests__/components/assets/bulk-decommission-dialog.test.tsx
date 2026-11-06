import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { BulkDecommissionDialog } from "@/components/assets/bulk-decommission-dialog";

function jsonResp(data: unknown, ok = true) {
  return { ok, json: async () => data };
}

beforeEach(() => vi.clearAllMocks());

function renderDialog(onComplete = vi.fn()) {
  render(
    <BulkDecommissionDialog
      open={true}
      onOpenChange={vi.fn()}
      assetIds={["a1", "a2"]}
      onComplete={onComplete}
    />
  );
  return onComplete;
}

describe("<BulkDecommissionDialog />", () => {
  it("disables submit until a disposal method is chosen", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "decommissionAsset" })).toBeDisabled();
  });

  it("submits ids, disposal method, and note", async () => {
    const user = userEvent.setup();
    const onComplete = renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ succeeded: ["a1", "a2"], failed: [] }));

    await user.selectOptions(screen.getByLabelText(/disposalMethodLabel/), "WIPED");
    await user.type(screen.getByPlaceholderText("decommissionReasonPlaceholder"), "cleanup");
    await user.click(screen.getByRole("button", { name: "decommissionAsset" }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/assets/bulk-decommission",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["a1", "a2"], disposalMethod: "WIPED", note: "cleanup" }),
      })
    );
    expect(onComplete).toHaveBeenCalledWith({ succeeded: ["a1", "a2"], failed: [] });
  });

  it("shows a results view listing skipped assets on partial failure", async () => {
    const user = userEvent.setup();
    renderDialog();
    mockFetch.mockResolvedValue(
      jsonResp({ succeeded: ["a1"], failed: [{ id: "a2", reason: "ALREADY_DECOMMISSIONED" }] })
    );

    await user.selectOptions(screen.getByLabelText(/disposalMethodLabel/), "WIPED");
    await user.click(screen.getByRole("button", { name: "decommissionAsset" }));

    expect(await screen.findByText("bulkDecommissionResultsTitle")).toBeInTheDocument();
    expect(screen.getByText("a2")).toBeInTheDocument();
    expect(screen.getByText("bulkSkipReason.ALREADY_DECOMMISSIONED")).toBeInTheDocument();
  });
});
