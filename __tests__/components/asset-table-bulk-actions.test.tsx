import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => [] }));
global.fetch = mockFetch as never;

import { AssetTable } from "@/components/assets/asset-table";

const ASSETS = [
  { id: "a1", model: "Model-A", serialNumber: "S1", hostname: null, quantity: 1, installationDate: null, type: { id: "t1", name: "Camera" }, manufacturer: null, macAddresses: [], _count: { attachments: 0 }, location: null },
  { id: "a2", model: "Model-B", serialNumber: "S2", hostname: null, quantity: 1, installationDate: null, type: { id: "t2", name: "Screen" }, manufacturer: null, macAddresses: [], _count: { attachments: 0 }, location: null },
];

beforeEach(() => vi.clearAllMocks());

describe("<AssetTable /> bulk actions", () => {
  it("renders a select-all checkbox and one per row for editors", () => {
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3); // header + 2 rows
  });

  it("renders no checkboxes for viewers", () => {
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("checking a row does not navigate to the asset detail page", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the bulk toolbar once rows are selected; Clear selection empties it", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "clearSelection" }));
    expect(screen.queryByText("itemsSelected")).not.toBeInTheDocument();
  });

  it("header checkbox selects only the currently filtered rows", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    await user.type(screen.getByLabelText("searchAssets"), "Model-A");
    const [headerCheckbox] = screen.getAllByRole("checkbox");
    await user.click(headerCheckbox);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2); // header + 1 filtered row
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
  });

  it("selection clears when the search query changes", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
    await user.type(screen.getByLabelText("searchAssets"), "x");
    expect(screen.queryByText("itemsSelected")).not.toBeInTheDocument();
  });

  it("opens the bulk decommission dialog with the selected assets", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    await user.click(screen.getByRole("button", { name: "decommissionAsset" }));
    expect(await screen.findByText("bulkDecommissionTitle")).toBeInTheDocument();
  });

  it("opens the bulk return-to-stock dialog with the selected assets", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    await user.click(screen.getByRole("button", { name: "returnToStock" }));
    expect(await screen.findByText("bulkReturnToStockConfirmTitle")).toBeInTheDocument();
  });
});
