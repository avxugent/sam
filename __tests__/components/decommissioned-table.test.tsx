import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
  usePathname: () => "/",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { DecommissionedTable, type DecommissionedAsset } from "@/components/assets/decommissioned-table";

const ASSETS: DecommissionedAsset[] = [
  { id: "a1", locationId: "l1", model: { name: "XPS" }, serialNumber: "SN1", decommissionedAt: "2024-01-15T00:00:00Z", decommissionNote: "EOL", lastLocationName: "Room 1", lastLocationFiNumber: "14.10.100.013", type: { id: "t1", name: "Laptop" }, manufacturer: { id: "m1", name: "Dell" } },
  { id: "a2", locationId: "l2", model: null, serialNumber: null, decommissionedAt: null, decommissionNote: null, lastLocationName: null, lastLocationFiNumber: null, type: { id: "t2", name: "Monitor" }, manufacturer: null },
];

const renderTable = (assets = ASSETS, userRole = "ADMIN") => render(<DecommissionedTable assets={assets} userRole={userRole} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("<DecommissionedTable />", () => {
  it("renders rows with type and serial", () => {
    renderTable();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("SN1")).toBeInTheDocument();
  });

  it("shows the empty state when there are none", () => {
    renderTable([]);
    expect(screen.getByText("noDecommissioned")).toBeInTheDocument();
  });

  it("filters by serial number", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText("searchDecommissioned"), "SN1");
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
  });

  it("hides the reinstate action for non-admins", () => {
    renderTable(ASSETS, "EDITOR");
    const row = screen.getByText("Laptop").closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("reinstates via the confirm dialog and refreshes", async () => {
    const user = userEvent.setup();
    renderTable();
    const row = screen.getByText("Laptop").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByRole("button", { name: "reinstate" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/assets/a1/reinstate", { method: "POST" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "reinstated" })));
  });

  it("shows a destructive toast on reinstate failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
    const user = userEvent.setup();
    renderTable();
    const row = screen.getByText("Laptop").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByRole("button", { name: "reinstate" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });

  it("sorts by each column header and toggles direction", async () => {
    const user = userEvent.setup();
    renderTable();
    // each sortable header holds a button; aria-sort on the cell reflects the state
    const headers = screen.getAllByRole("columnheader").filter((h) => within(h).queryByRole("button"));
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      await user.click(within(h).getByRole("button")); // set / asc
      expect(h).toHaveAttribute("aria-sort", "ascending");
      await user.click(within(h).getByRole("button")); // toggle desc
      expect(h).toHaveAttribute("aria-sort", "descending");
    }
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });

  it("filters by last-location and manufacturer too", async () => {
    const user = userEvent.setup();
    renderTable();
    const box = screen.getByPlaceholderText("searchDecommissioned");
    await user.type(box, "Room 1");
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "Dell");
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
  });
});
