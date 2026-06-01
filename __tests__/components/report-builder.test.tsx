import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/",
}));
const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { ReportBuilder } from "@/components/reports/ReportBuilder";

const OPTS = { assetTypes: [{ id: "t1", name: "Laptop" }], manufacturers: [{ id: "m1", name: "Dell" }], locations: [{ id: "l1", name: "Room 1" }] };

function renderBuilder(props = {}) {
  return render(<ReportBuilder {...OPTS} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "r9" }) });
});

describe("<ReportBuilder />", () => {
  it("renders the details, filters, group-by, and columns sections", () => {
    renderBuilder();
    expect(screen.getByLabelText(/reportName/)).toBeInTheDocument();
    expect(screen.getByText("noFilters")).toBeInTheDocument();
    expect(screen.getByText("groupBy")).toBeInTheDocument();
  });

  it("adds and removes a filter row", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "addFilter" }));
    expect(screen.queryByText("noFilters")).not.toBeInTheDocument();
    const removeBtn = screen.getByRole("button", { name: /removeFilter/ });
    await user.click(removeBtn);
    expect(screen.getByText("noFilters")).toBeInTheDocument();
  });

  it("toggles a column's active state on click", async () => {
    const user = userEvent.setup();
    renderBuilder();
    // 'notes' is NOT in DEFAULT_COLUMNS → starts inactive (no white text)
    const notesBtn = screen.getByRole("button", { name: "notes" });
    expect(notesBtn.className).not.toContain("text-white");
    await user.click(notesBtn);
    expect(notesBtn.className).toContain("text-white"); // now active
    await user.click(notesBtn);
    expect(notesBtn.className).not.toContain("text-white"); // back to inactive
  });

  it("shows the no-columns error when all columns are removed", async () => {
    const user = userEvent.setup();
    renderBuilder({ initialDefinition: { filters: [], groupBy: "none", columns: ["model"] } });
    expect(screen.queryByText("selectColumnError")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "model" })); // remove last column
    expect(screen.getByText("selectColumnError")).toBeInTheDocument();
  });

  it("renders a value control for the default filter (entity field + eq)", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "addFilter" }));
    // default filter is typeId/eq → a Radix Select trigger (combobox) is shown for the value
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(3);
  });

  it("blocks save with a toast when the name is empty", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "saveReport" }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "nameRequired", variant: "destructive" }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs a new report and navigates on success", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.type(screen.getByLabelText(/reportName/), "Q1 Report");
    await user.click(screen.getByRole("button", { name: "saveReport" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/reports", expect.objectContaining({ method: "POST" }))
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe("Q1 Report");
    expect(body.definition.columns.length).toBeGreaterThan(0);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/reports/r9"));
  });

  it("PUTs when editing an existing report", async () => {
    const user = userEvent.setup();
    renderBuilder({ reportId: "r1", initialName: "Existing" });
    await user.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/reports/r1", expect.objectContaining({ method: "PUT" }))
    );
  });

  it("shows an error toast when saving fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Boom" }) });
    const user = userEvent.setup();
    renderBuilder({ initialName: "X" });
    await user.click(screen.getByRole("button", { name: "saveReport" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "errorSaving", description: "Boom" }))
    );
  });
});
