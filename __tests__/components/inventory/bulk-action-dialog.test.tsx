import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { BulkActionDialog } from "@/components/inventory/bulk-action-dialog";

function jsonResp(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

beforeEach(() => vi.clearAllMocks());

function renderDialog() {
  const props = { onOpenChange: vi.fn(), onComplete: vi.fn(), onReset: vi.fn() };
  render(
    <BulkActionDialog
      open={true}
      {...props}
      url="/api/things/bulk"
      body={() => ({ ids: ["a1"] })}
      title="Do it"
      description="To every selected row"
      resultTitle="Results"
      resultSummary={(n) => `${n} skipped`}
      reasonLabel={(r) => r}
      confirmLabel={(submitting) => (submitting ? "Working" : "Confirm")}
      confirmClassName=""
    >
      <p>fields</p>
    </BulkActionDialog>
  );
  return props;
}

describe("<BulkActionDialog />", () => {
  it("closes and resets the fields when every row succeeded", async () => {
    const props = renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ succeeded: ["a1"], failed: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mockFetch).toHaveBeenCalledWith("/api/things/bulk", expect.objectContaining({ body: JSON.stringify({ ids: ["a1"] }) }));
    expect(props.onComplete).toHaveBeenCalledWith({ succeeded: ["a1"], failed: [] });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onReset).toHaveBeenCalled();
  });

  it("toasts a failed request and stays open on the confirm step", async () => {
    const props = renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ error: "Nope" }, false, 400));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Nope", variant: "destructive" }));
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("fields")).toBeInTheDocument();
  });

  it("closes from the cancel button", async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onReset).toHaveBeenCalled();
  });
});
