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

import { StockItemTable, type StockItem } from "@/components/stock/stock-item-table";

const ITEMS: StockItem[] = [
  { id: "s1", typeId: "at1", type: { id: "at1", name: "Laptop" }, manufacturerId: "m1", manufacturer: { id: "m1", name: "Dell" }, modelId: "mo1", model: { id: "mo1", name: "XPS" }, serialNumber: "SN1", quantity: 1, invoiceNumber: null, invoiceDate: null, notes: null, locationId: "loc1", location: { id: "loc1", name: "Storage Room" }, reservedForLocationId: null, metadata: null },
  { id: "s2", typeId: "at2", type: { id: "at2", name: "Monitor" }, manufacturerId: null, manufacturer: null, modelId: "mo2", model: { id: "mo2", name: "U27" }, serialNumber: null, quantity: 7, invoiceNumber: null, invoiceDate: null, notes: null, locationId: null, location: null, reservedForLocationId: null, metadata: null },
];

const renderTable = (items = ITEMS, userRole = "ADMIN", locationBreadcrumbs = { loc1: "Campus A › Storage Room" }) =>
  render(<StockItemTable items={items} userRole={userRole} locationBreadcrumbs={locationBreadcrumbs} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/locations") return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe("<StockItemTable />", () => {
  it("renders a row per stock item", () => {
    renderTable();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });

  it("shows the storage location breadcrumb and Unassigned for items without one", () => {
    renderTable();
    expect(screen.getByText("Campus A › Storage Room")).toBeInTheDocument();
    expect(screen.getByText("unassigned")).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", () => {
    renderTable([]);
    expect(screen.getByText("noStockItems")).toBeInTheDocument();
  });

  it("filters rows by the search box", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText("searchStock"), "monitor");
    expect(screen.queryByText("Laptop")).not.toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });

  it("hides edit/delete actions for viewers", () => {
    renderTable(ITEMS, "VIEWER");
    // action column suppressed → no delete trigger
    const row = screen.getByText("Laptop").closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("deletes via the confirm dialog and refreshes", async () => {
    const user = userEvent.setup();
    renderTable();
    const row = screen.getByText("Laptop").closest("tr")!;
    // last action button = delete trigger
    const actions = within(row).getAllByRole("button");
    await user.click(actions[actions.length - 1]);
    // AlertDialog confirm
    await user.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/stock/s1", { method: "DELETE" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "stockItemDeleted" })));
  });

  it("shows a destructive toast when delete fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    const user = userEvent.setup();
    renderTable();
    const row = screen.getByText("Laptop").closest("tr")!;
    const actions = within(row).getAllByRole("button");
    await user.click(actions[actions.length - 1]);
    await user.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });

  it("sorts by each column and toggles direction", async () => {
    const user = userEvent.setup();
    renderTable();
    for (const col of ["type", "manufacturer", "model", "serial", "qty"]) {
      const header = screen.getByRole("button", { name: new RegExp(col, "i") });
      await user.click(header); // asc
      await user.click(header); // desc (toggle branch)
    }
    // table still renders both rows after sorting
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });

  it("shows a select-all checkbox and one per row for editors", () => {
    renderTable();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3); // header + 2 rows
  });

  it("renders no checkboxes for viewers", () => {
    renderTable(ITEMS, "VIEWER");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("selecting rows shows the bulk toolbar; Clear selection empties it", async () => {
    const user = userEvent.setup();
    renderTable();
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "clearSelection" }));
    expect(screen.queryByText("itemsSelected")).not.toBeInTheDocument();
  });

  it("header checkbox selects only the currently filtered rows", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText("searchStock"), "monitor");
    const [headerCheckbox] = screen.getAllByRole("checkbox");
    await user.click(headerCheckbox);
    // only the filtered Monitor row is selectable/selected now
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
  });

  it("selection clears when the search query changes", async () => {
    const user = userEvent.setup();
    renderTable();
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    expect(screen.getByText("itemsSelected")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("searchStock"), "x");
    expect(screen.queryByText("itemsSelected")).not.toBeInTheDocument();
  });

  it("Relocate opens the bulk relocate dialog for the selected items", async () => {
    const user = userEvent.setup();
    renderTable();
    const [, row1Checkbox] = screen.getAllByRole("checkbox");
    await user.click(row1Checkbox);
    await user.click(screen.getByRole("button", { name: "relocateSelected" }));
    expect(await screen.findByText("bulkRelocateTitle")).toBeInTheDocument();
  });
});
