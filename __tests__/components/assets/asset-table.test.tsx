import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockPush, mockRefresh, mockToast } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/",
}));
// Keys come back verbatim, with any params appended, so assertions can see them.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

// The child dialogs have their own tests; here they only expose the callbacks
// the table hands them.
vi.mock("@/components/assets/asset-form-dialog", () => ({
  AssetFormDialog: ({ children, onSuccess }: { children: React.ReactNode; onSuccess?: () => void }) => (
    <span onDoubleClick={onSuccess}>{children}</span>
  ),
}));
vi.mock("@/components/assets/remove-asset-dialog", () => ({
  RemoveAssetDialog: ({ children, onRemoved }: { children: React.ReactNode; onRemoved: () => void }) => (
    <span onDoubleClick={onRemoved}>{children}</span>
  ),
}));
type BulkProps = {
  open: boolean;
  assetIds: string[];
  onComplete: (r: { succeeded: string[]; failed: { id: string; reason: string }[] }) => void;
};
vi.mock("@/components/assets/bulk-decommission-dialog", () => ({
  BulkDecommissionDialog: ({ open, assetIds, onComplete }: BulkProps) =>
    open ? (
      <div role="dialog" aria-label="decommission">
        <span>ids:{assetIds.join(",")}</span>
        <button onClick={() => onComplete({ succeeded: assetIds, failed: [] })}>finish-decommission</button>
      </div>
    ) : null,
}));
vi.mock("@/components/assets/bulk-return-to-stock-dialog", () => ({
  BulkReturnToStockDialog: ({ open, assetIds, onComplete }: BulkProps) =>
    open ? (
      <div role="dialog" aria-label="return">
        <span>ids:{assetIds.join(",")}</span>
        <button onClick={() => onComplete({ succeeded: [], failed: assetIds.map((id) => ({ id, reason: "x" })) })}>
          finish-return
        </button>
      </div>
    ) : null,
}));

import { AssetTable } from "@/components/assets/asset-table";
import type { AssetListRow } from "@/lib/assets/include";

function row(id: string, over: Partial<Record<string, unknown>> = {}): AssetListRow {
  return {
    id,
    status: "INSTALLED",
    model: { id: `mo-${id}`, name: `Model-${id}` },
    serialNumber: `SN-${id}`,
    hostname: null,
    quantity: 1,
    installationDate: null,
    type: { id: "t1", name: "Camera" },
    manufacturer: null,
    macAddresses: [],
    _count: { attachments: 0 },
    location: { id: "loc-1", name: "Room 1" },
    ...over,
  } as unknown as AssetListRow;
}

// Each column orders these three differently, so every sort is observable.
const ASSETS: AssetListRow[] = [
  row("a", {
    type: { id: "t2", name: "Screen" },
    manufacturer: { id: "m1", name: "Sony" },
    model: { id: "mo1", name: "Bravo" },
    serialNumber: "S2",
    hostname: "zeta.ugent.be",
    installationDate: "2024-03-01T00:00:00.000Z",
    location: { id: "loc-2", name: "Hall B" },
    macAddresses: [{ address: "AA:BB:CC:DD:EE:01" }],
  }),
  row("b", {
    type: null,
    manufacturer: null,
    model: { id: "mo2", name: "Alpha" },
    serialNumber: null,
    hostname: null,
    installationDate: null,
    location: { id: "loc-3", name: "Atrium" },
  }),
  row("c", {
    type: { id: "t1", name: "Camera" },
    manufacturer: { id: "m2", name: "Epson" },
    model: { id: "mo3", name: "Charlie" },
    serialNumber: "S1",
    hostname: "alpha.ugent.be",
    installationDate: "2023-01-01T00:00:00.000Z",
    location: { id: "loc-1", name: "Room 1" },
    quantity: 3,
  }),
];

/** Row order by model name, read from each row's accessible name. */
function order() {
  return screen
    .getAllByRole("link", { name: /^openAssetNamed/ })
    .map((r) => JSON.parse(r.getAttribute("aria-label")!.replace("openAssetNamed ", "")).name);
}

beforeEach(() => vi.clearAllMocks());

describe("<AssetTable /> rendering", () => {
  it("shows the empty state when there are no assets", () => {
    render(<AssetTable assets={[]} locationId="loc-1" userRole="ADMIN" />);
    expect(screen.getByText("noAssetsInLocation")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders placeholders, quantity and the location column", () => {
    render(
      <AssetTable
        assets={[...ASSETS, row("d", { model: null, serialNumber: null, hostname: "h.ugent.be" })]}
        locationId="loc-1"
        userRole="VIEWER"
        showLocation
      />
    );
    const noType = screen.getByRole("link", { name: 'openAssetNamed {"name":"Alpha"}' });
    expect(within(noType).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.getByText("noModel")).toBeInTheDocument();
    // Falls back to the hostname for the row's name when there is no model.
    expect(screen.getByRole("link", { name: 'openAssetNamed {"name":"h.ugent.be"}' })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hall B" })).toHaveAttribute("href", "/locations/loc-2");
    expect(screen.getByRole("button", { name: /location/ })).toBeInTheDocument();
    // Viewers get no edit/remove buttons.
    expect(screen.queryByRole("button", { name: /^editAssetNamed/ })).not.toBeInTheDocument();
  });

  it("links hostnames through the URL template, without navigating the row", async () => {
    const user = userEvent.setup();
    render(
      <AssetTable
        assets={ASSETS}
        locationId="loc-1"
        userRole="VIEWER"
        hostnameUrlTemplate="https://mon.example/{hostname}?s={serial}"
      />
    );
    const link = screen.getByRole("link", { name: "zeta.ugent.be" });
    expect(link).toHaveAttribute("href", "https://mon.example/zeta.ugent.be?s=S2");
    expect(link).toHaveAttribute("target", "_blank");
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows hostnames as plain text without a template", () => {
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    expect(screen.getByText("zeta.ugent.be")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "zeta.ugent.be" })).not.toBeInTheDocument();
  });

  it("navigates to the asset on row click and on Enter", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    await user.click(screen.getByRole("link", { name: 'openAssetNamed {"name":"Bravo"}' }));
    expect(mockPush).toHaveBeenCalledWith("/locations/loc-2/assets/a");
    const alpha = screen.getByRole("link", { name: 'openAssetNamed {"name":"Alpha"}' });
    fireEvent.keyDown(alpha, { key: "Space" });
    expect(mockPush).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(alpha, { key: "Enter" });
    expect(mockPush).toHaveBeenLastCalledWith("/locations/loc-3/assets/b");
  });

  it("syncs rows when the parent passes new assets", () => {
    const { rerender } = render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    rerender(<AssetTable assets={[ASSETS[0]]} locationId="loc-1" userRole="VIEWER" />);
    expect(order()).toEqual(["Bravo"]);
  });
});

describe("<AssetTable /> sorting", () => {
  it("sorts by type ascending by default and descending on a second click", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    // null type sorts as "" → first.
    expect(order()).toEqual(["Alpha", "Charlie", "Bravo"]);
    await user.click(screen.getByRole("button", { name: "type" }));
    expect(order()).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(screen.getByRole("columnheader", { name: "type" })).toHaveAttribute("aria-sort", "descending");
  });

  it.each([
    ["manufacturer", ["Alpha", "Charlie", "Bravo"]],
    ["model", ["Alpha", "Bravo", "Charlie"]],
    ["serialNumber", ["Alpha", "Charlie", "Bravo"]],
    ["hostname", ["Alpha", "Charlie", "Bravo"]],
    ["installed", ["Alpha", "Charlie", "Bravo"]],
    ["location", ["Alpha", "Bravo", "Charlie"]],
  ])("sorts by %s in both directions", async (label, asc) => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" showLocation />);
    const header = screen.getByRole("button", { name: label });
    await user.click(header);
    expect(order()).toEqual(asc);
    await user.click(header);
    expect(order()).toEqual([...asc].reverse());
  });
});

describe("<AssetTable /> filtering", () => {
  it.each([
    ["model", "charl", ["Charlie"]],
    ["serial", "s2", ["Bravo"]],
    ["hostname", "alpha.ugent", ["Charlie"]],
    ["type", "screen", ["Bravo"]],
    ["manufacturer", "epson", ["Charlie"]],
    ["MAC address", "ee:01", ["Bravo"]],
  ])("matches on %s", async (_what, query, expected) => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    await user.type(screen.getByLabelText("searchAssets"), query);
    expect(order()).toEqual(expected);
    expect(screen.getByText(/filteredFrom \{"total":3\}/)).toBeInTheDocument();
  });

  it("shows the no-results row and a zero count when nothing matches", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="ADMIN" />);
    await user.type(screen.getByLabelText("searchAssets"), "nothing-matches");
    expect(screen.queryAllByRole("link", { name: /^openAssetNamed/ })).toHaveLength(0);
    expect(screen.getByRole("cell", { name: "noAssetsInLocation" })).toHaveAttribute("colspan", "8");
    expect(screen.getByText(/^0 of/)).toBeInTheDocument();
  });
});

describe("<AssetTable /> pagination", () => {
  const MANY = Array.from({ length: 60 }, (_, i) => row(`r${String(i).padStart(2, "0")}`));

  it("pages through rows with next, previous and page buttons", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={MANY} locationId="loc-1" userRole="VIEWER" />);
    expect(order()).toHaveLength(25);
    expect(screen.getByText(/pagination \{"from":1,"to":25,"total":60\}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "previousPage" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "nextPage" }));
    expect(screen.getByText(/pagination \{"from":26,"to":50,"total":60\}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'goToPage {"page":2}' })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: 'goToPage {"page":3}' }));
    expect(order()).toHaveLength(10);
    expect(screen.getByRole("button", { name: "nextPage" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "previousPage" }));
    expect(screen.getByText(/pagination \{"from":26,"to":50,"total":60\}/)).toBeInTheDocument();
  });

  it("changes the page size and collapses distant pages into an ellipsis", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={MANY} locationId="loc-1" userRole="VIEWER" />);
    await user.click(screen.getByRole("button", { name: 'goToPage {"page":2}' }));
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "10" }));
    expect(order()).toHaveLength(10);
    // Back on page 1 of 6: 1, 2, …, 6.
    expect(screen.getByRole("button", { name: 'goToPage {"page":1}' })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: 'goToPage {"page":6}' })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: 'goToPage {"page":4}' })).not.toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("returns to page 1 when the sort changes", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={MANY} locationId="loc-1" userRole="VIEWER" />);
    await user.click(screen.getByRole("button", { name: 'goToPage {"page":3}' }));
    await user.click(screen.getByRole("button", { name: "model" }));
    expect(screen.getByRole("button", { name: 'goToPage {"page":1}' })).toHaveAttribute("aria-current", "page");
  });
});

describe("<AssetTable /> selection and bulk actions", () => {
  it("select-all toggles every filtered row and the header shows the partial state", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="EDITOR" />);
    const header = screen.getByRole("checkbox", { name: "selectAllRows" });
    await user.click(screen.getByRole("checkbox", { name: /selectRow \{"name":"Bravo"\}/ }));
    expect(header).toHaveAttribute("data-state", "indeterminate");
    await user.click(header);
    expect(header).toHaveAttribute("data-state", "checked");
    expect(screen.getByText(/itemsSelected \{"count":3\}/)).toBeInTheDocument();
    await user.click(header);
    expect(screen.queryByText(/itemsSelected/)).not.toBeInTheDocument();
  });

  it("decommissions the selection and toasts success", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="EDITOR" />);
    await user.click(screen.getByRole("checkbox", { name: /selectRow \{"name":"Bravo"\}/ }));
    await user.click(screen.getByRole("button", { name: "decommissionAsset" }));
    expect(screen.getByText("ids:a")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "finish-decommission" }));
    expect(mockToast).toHaveBeenCalledWith({ title: 'bulkDecommissionSuccessToast {"count":1}' });
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.queryByText(/itemsSelected/)).not.toBeInTheDocument();
  });

  it("returns the selection to stock and toasts the skipped rows", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="EDITOR" />);
    await user.click(screen.getByRole("checkbox", { name: "selectAllRows" }));
    await user.click(screen.getByRole("button", { name: "returnToStock" }));
    await user.click(screen.getByRole("button", { name: "finish-return" }));
    expect(mockToast).toHaveBeenCalledWith({
      title: 'bulkReturnToStockSuccessToast {"count":0}',
      description: 'bulkSkippedSummary {"count":3}',
      variant: "destructive",
    });
  });

  it("drops a removed asset and refreshes; an edit refreshes too", async () => {
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="EDITOR" />);
    fireEvent.doubleClick(screen.getByRole("button", { name: 'removeAssetNamed {"name":"Alpha"}' }));
    expect(order()).toEqual(["Charlie", "Bravo"]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole("button", { name: 'editAssetNamed {"name":"Bravo"}' }));
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});

describe("<AssetTable /> CSV export", () => {
  let blobs: Blob[];
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    blobs = [];
    clicked = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:csv";
    }) as never;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports the visible rows in their current order", async () => {
    const user = userEvent.setup();
    render(<AssetTable assets={ASSETS} locationId="loc-1" userRole="VIEWER" />);
    await user.type(screen.getByLabelText("searchAssets"), ".ugent.be");
    await user.click(screen.getByRole("button", { name: /exportCsv/ }));

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("assets.csv");
    expect(clicked[0].href).toBe("blob:csv");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");

    const lines = (await blobs[0].text()).split("\r\n");
    expect(lines[0]).toBe("type;manufacturer;model;serialNumber;hostname;macAddresses;quantity;location;installed");
    expect(lines.slice(1)).toEqual([
      "Camera;Epson;Charlie;S1;alpha.ugent.be;;3;Room 1;2023-01-01",
      "Screen;Sony;Bravo;S2;zeta.ugent.be;AA:BB:CC:DD:EE:01;1;Hall B;2024-03-01",
    ]);
  });

  it("writes installation dates as the UTC day, like the server exports", async () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const user = userEvent.setup();
      render(<AssetTable assets={[row("x", { installationDate: "2024-03-01T00:00:00.000Z" })]} locationId="loc-1" userRole="VIEWER" />);
      await user.click(screen.getByRole("button", { name: /exportCsv/ }));
      const lines = (await blobs[0].text()).split("\r\n");
      expect(lines[1].endsWith(";2024-03-01")).toBe(true);
    } finally {
      process.env.TZ = tz;
    }
  });
});
