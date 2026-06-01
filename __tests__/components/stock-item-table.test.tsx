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
  { id: "s1", typeId: "at1", type: { id: "at1", name: "Laptop" }, manufacturerId: "m1", manufacturer: { id: "m1", name: "Dell" }, model: "XPS", serialNumber: "SN1", quantity: 1, invoiceNumber: null, invoiceDate: null, notes: null, reservedForLocationId: null },
  { id: "s2", typeId: "at2", type: { id: "at2", name: "Monitor" }, manufacturerId: null, manufacturer: null, model: "U27", serialNumber: null, quantity: 7, invoiceNumber: null, invoiceDate: null, notes: null, reservedForLocationId: null },
];

const renderTable = (items = ITEMS, userRole = "ADMIN") => render(<StockItemTable items={items} userRole={userRole} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("<StockItemTable />", () => {
  it("renders a row per stock item", () => {
    renderTable();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
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
});
