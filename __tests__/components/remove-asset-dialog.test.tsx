import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { RemoveAssetDialog } from "@/components/assets/remove-asset-dialog";

const LOCATION_TREE = [
  { id: "loc-1", name: "Room 101", parentId: null, _count: { stockItems: 1 } },
  { id: "loc-2", name: "Room 202", parentId: null, _count: { stockItems: 0 } },
];

function mockFetchImpl(url: string) {
  if (url === "/api/locations") {
    return Promise.resolve({ ok: true, json: async () => LOCATION_TREE });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
}

function renderDialog(onRemoved = vi.fn()) {
  render(
    <RemoveAssetDialog assetId="a1" assetName="Recorder 1" onRemoved={onRemoved}>
      <button>Open</button>
    </RemoveAssetDialog>
  );
  return onRemoved;
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation(mockFetchImpl);
});

describe("<RemoveAssetDialog />", () => {
  it("shows the three choices when opened", async () => {
    renderDialog();
    await openDialog();
    expect(screen.getByText("returnToStock")).toBeInTheDocument();
    expect(screen.getByText("decommissionAsset")).toBeInTheDocument();
    expect(screen.getByText("delete")).toBeInTheDocument();
  });

  it("moves to stock: confirm is disabled until a location is picked, then posts to return-to-stock", async () => {
    const onRemoved = renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("returnToStock"));

    const confirmBtn = screen.getByRole("button", { name: "returnToStock" });
    expect(confirmBtn).toBeDisabled();

    await user.click(await screen.findByText("Room 101"));
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assets/a1/return-to-stock",
        expect.objectContaining({ method: "POST" })
      )
    );
    const body = JSON.parse(
      mockFetch.mock.calls.find((c) => c[0] === "/api/assets/a1/return-to-stock")![1].body
    );
    expect(body.locationId).toBe("loc-1");
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith("stock"));
  });

  it("moves to stock: only locations already holding stock show by default; 'show all locations' reveals the rest", async () => {
    renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("returnToStock"));

    await screen.findByText("Room 101");
    expect(screen.queryByText("Room 202")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "showAllLocations" }));
    expect(screen.getByText("Room 202")).toBeInTheDocument();
  });

  it("decommission: confirm is disabled until a disposal method is picked", async () => {
    const onRemoved = renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("decommissionAsset"));

    const confirmBtn = screen.getByRole("button", { name: "decommissionAsset" });
    expect(confirmBtn).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/disposalMethodLabel/), "WIPED");
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assets/a1/decommission",
        expect.objectContaining({ method: "POST" })
      )
    );
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[0] === "/api/assets/a1/decommission")![1].body);
    expect(body.disposalMethod).toBe("WIPED");
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith("decommission"));
  });

  it("delete: deletes the asset and reports the action", async () => {
    const onRemoved = renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("delete"));
    await user.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/assets/a1", { method: "DELETE" })
    );
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith("delete"));
  });

  it("back returns to the choice screen", async () => {
    renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("returnToStock"));
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("decommissionAsset")).toBeInTheDocument();
  });

  it("shows an error toast and keeps the dialog open when the request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
    const onRemoved = renderDialog();
    const user = await openDialog();
    await user.click(screen.getByText("delete"));
    await user.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "boom" })));
    expect(onRemoved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();
  });
});
