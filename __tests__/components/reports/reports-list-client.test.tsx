import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import { ReportsListClient } from "@/components/reports/reports-list-client";

const REPORTS = [
  { id: "r1", name: "Q1 Inventory", description: "All assets", createdAt: "2024-01-01", updatedAt: "2024-02-01" },
  { id: "r2", name: "Decommissioned", description: null, createdAt: "2024-01-01", updatedAt: "2024-02-01" },
];

const renderList = (props = {}) =>
  render(<ReportsListClient reports={REPORTS} userRole="ADMIN" {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("<ReportsListClient />", () => {
  it("renders a row per report", () => {
    renderList();
    expect(screen.getByText("Q1 Inventory")).toBeInTheDocument();
    expect(screen.getByText("Decommissioned")).toBeInTheDocument();
  });

  it("shows the empty state with no reports", () => {
    renderList({ reports: [] });
    expect(screen.getByText("noReports")).toBeInTheDocument();
  });

  it("hides edit/delete actions from a viewer", () => {
    renderList({ userRole: "VIEWER" });
    expect(screen.queryByLabelText(/editReport/)).toBeNull();
    expect(screen.queryByLabelText(/deleteReport/)).toBeNull();
  });

  it("lets an editor edit but not delete", () => {
    renderList({ userRole: "EDITOR" });
    expect(screen.getByLabelText("editReport Q1 Inventory")).toBeInTheDocument();
    expect(screen.queryByLabelText(/deleteReport/)).toBeNull();
  });

  it("deletes a report through the confirm dialog and refreshes", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByLabelText("deleteReport Q1 Inventory"));
    await user.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/reports/r1", { method: "DELETE" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "deleted" })));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows a destructive toast when delete fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByLabelText("deleteReport Q1 Inventory"));
    await user.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});
