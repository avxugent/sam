import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { ReportViewer } from "@/components/reports/report-viewer";
import type { AssetReportResult } from "@/lib/reports/types";
import type { ColumnKey } from "@/lib/schemas/report";

function row(over: Record<string, unknown> = {}) {
  return { id: "a1", model: "XPS", serialNumber: "SN1", hostname: "h1", type: "Laptop", manufacturer: "Dell", location: "Room 1", locationId: "l1", installationDate: null, invoiceDate: null, invoiceNumber: null, notes: null, lastChanged: null, ...over };
}
const COLUMNS: ColumnKey[] = ["model", "type", "serialNumber", "location"];
const RESULT: AssetReportResult = {
  source: "asset",
  rows: [row(), row({ id: "a2", model: "U27", type: "Monitor", serialNumber: "SN2", location: "Room 2", locationId: "l2" })],
  groups: [{ label: "Laptop", count: 1 }, { label: "Monitor", count: 1 }],
  total: 2,
};

const renderViewer = (props = {}) =>
  render(<ReportViewer reportId="r1" reportName="Q1 / Report" columns={COLUMNS} result={RESULT} canEdit {...props} />);

beforeEach(() => vi.clearAllMocks());

describe("<ReportViewer />", () => {
  it("renders rows and group counts", () => {
    renderViewer();
    expect(screen.getByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("U27")).toBeInTheDocument();
    // Laptop/Monitor appear both as row type badge and group chip
    expect(screen.getAllByText("Laptop").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Monitor").length).toBeGreaterThanOrEqual(1);
  });

  it("filters rows by the search box", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.type(screen.getByPlaceholderText("filterResults"), "U27");
    expect(screen.queryByText("XPS")).not.toBeInTheDocument();
    expect(screen.getByText("U27")).toBeInTheDocument();
  });

  it("shows the no-match state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.type(screen.getByPlaceholderText("filterResults"), "zzz");
    expect(screen.getByText("noMatchingResults")).toBeInTheDocument();
  });

  it("sorts by a column header click", async () => {
    const user = userEvent.setup();
    renderViewer();
    const header = screen.getByText("model").closest("th")!;
    await user.click(header);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await user.click(header);
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("exports CSV via a blob download", async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["csv"]) });
    global.URL.createObjectURL = vi.fn(() => "blob:x");
    global.URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "exportCsv" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/reports/r1/export"));
  });

  it("toasts on export failure", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "exportCsv" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});
