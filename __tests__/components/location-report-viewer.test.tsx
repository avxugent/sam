import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { LocationReportViewer } from "@/components/reports/LocationReportViewer";
import type { LocationReportResult } from "@/lib/report-types";

const RESULT: LocationReportResult = {
  source: "location",
  itemColumns: [{ id: "wi1", name: "Review asset list" }],
  rows: [
    { id: "loc1", locationId: "loc1", name: "Room 1", path: "Campus 14 - Building 10 - Room 1", fiNumber: "14.10.100.001", campus: "Campus 14", building: "Building 10", items: { wi1: { filled: true, date: "2024-05-01", performedBy: "Alice" } } },
    { id: "loc2", locationId: "loc2", name: "Room 2", path: "Campus 14 - Building 10 - Room 2", fiNumber: null, campus: "Campus 14", building: "Building 10", items: { wi1: { filled: false, date: null, performedBy: null } } },
  ],
  total: 2,
  filledCount: 1,
  notFilledCount: 1,
};

const renderViewer = (props = {}) =>
  render(<LocationReportViewer reportId="r1" reportName="Coverage" result={RESULT} canEdit {...props} />);

beforeEach(() => vi.clearAllMocks());

describe("<LocationReportViewer />", () => {
  it("renders the item header, the campus/building group, and both rooms", () => {
    renderViewer();
    expect(screen.getByText("Review asset list")).toBeInTheDocument();
    expect(screen.getByText("Campus 14 / Building 10")).toBeInTheDocument();
    expect(screen.getByText("Room 1")).toBeInTheDocument();
    expect(screen.getByText("Room 2")).toBeInTheDocument();
  });

  it("shows the filled date and the not-filled marker", () => {
    renderViewer();
    expect(screen.getByText("2024-05-01")).toBeInTheDocument();
    expect(screen.getByText("notFilled")).toBeInTheDocument();
  });

  it("filters rows by the search box", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.type(screen.getByPlaceholderText("filterResults"), "Room 2");
    expect(screen.queryByText("Room 1")).not.toBeInTheDocument();
    expect(screen.getByText("Room 2")).toBeInTheDocument();
  });

  it("downloads a CSV when export is clicked", async () => {
    const user = userEvent.setup();
    const createUrl = vi.fn(() => "blob:url");
    const revokeUrl = vi.fn();
    global.URL.createObjectURL = createUrl as never;
    global.URL.revokeObjectURL = revokeUrl as never;
    mockFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["csv"]) });
    renderViewer();
    await user.click(screen.getByRole("button", { name: "exportCsv" }));
    expect(mockFetch).toHaveBeenCalledWith("/api/reports/r1/export");
  });
});
