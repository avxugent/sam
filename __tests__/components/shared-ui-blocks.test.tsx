import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useFieldArray } from "react-hook-form";

const tFn = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BulkResultSummary } from "@/components/inventory/bulk-result-summary";
import { MacAddressFields } from "@/components/inventory/mac-address-fields";
import { AssetStateTable } from "@/components/assets/asset-state-table";
import { AssetDrilldownDialog } from "@/components/admin/catalog/asset-drilldown-dialog";
import { ReportToolbar } from "@/components/reports/report-toolbar";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
beforeEach(() => vi.clearAllMocks());

describe("BulkResultSummary", () => {
  it("lists skipped ids with their reason labels", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <BulkResultSummary title="Done" summary="1 skipped" failed={[{ id: "a1", reason: "NOT_FOUND" }]} reasonLabel={(r) => `reason:${r}`} onClose={onClose} />
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("reason:NOT_FOUND")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

function MacHarness() {
  const { control, register } = useForm<{ macAddresses: { address: string }[] }>({ defaultValues: { macAddresses: [] } });
  const { fields, append, remove } = useFieldArray({ control, name: "macAddresses" });
  return <MacAddressFields fields={fields} register={register} onAdd={() => append({ address: "" })} onRemove={remove} required helpText="help" listError="need one" />;
}

describe("MacAddressFields", () => {
  it("adds, auto-formats and removes MAC inputs", async () => {
    render(<MacHarness />);
    expect(screen.getByText("need one")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "add" }));
    const input = screen.getByRole("textbox", { name: "macAddress 1" });
    await userEvent.type(input, "aabbccddeeff");
    expect(input).toHaveValue("AA:BB:CC:DD:EE:FF");
    await userEvent.click(screen.getByRole("button", { name: /removeAriaLabel/ }));
    expect(screen.queryByRole("textbox", { name: "macAddress 1" })).not.toBeInTheDocument();
  });
});

describe("AssetStateTable", () => {
  const rows = [
    { id: "1", locationId: "l", model: { name: "Zeta" }, serialNumber: null, type: null, manufacturer: null, locationName: "Room", since: "2024-01-02", note: "fan" },
    { id: "2", locationId: "l", model: { name: "Alpha" }, serialNumber: "SN", type: null, manufacturer: null, locationName: "Hall", since: "2024-03-04", note: null },
  ];
  const labels = { search: "search", location: "where", since: "since", note: "note", empty: "nothing" };

  it("filters, sorts and renders the optional action column", async () => {
    render(<AssetStateTable rows={rows} labels={labels} renderActions={(r) => <span>act-{r.id}</span>} />);
    await userEvent.click(screen.getByRole("button", { name: "model" }));
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["Alpha", "Zeta"]);
    expect(screen.getByText("act-1")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("search"), "fan");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    await userEvent.type(screen.getByPlaceholderText("search"), "xyz");
    expect(screen.getByText("nothing")).toBeInTheDocument();
  });
});

describe("AssetDrilldownDialog", () => {
  it("loads and lists the assets for the source", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "a", model: { name: "XPS" }, location: { id: "l", name: "Room" }, manufacturer: { name: "Dell" } }] });
    render(<AssetDrilldownDialog source={{ name: "Laptops", url: "/api/asset-types/t/assets" }} column="manufacturer" onClose={() => {}} />);
    expect(await screen.findByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("Dell")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/asset-types/t/assets", undefined);
  });

  it("shows the empty state", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(<AssetDrilldownDialog source={{ name: "X", url: "/u" }} column="type" onClose={() => {}} />);
    expect(await screen.findByText("noAssetsFound")).toBeInTheDocument();
  });

  it("reports a failed load instead of showing it as no assets", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Database down" }) });
    render(<AssetDrilldownDialog source={{ name: "X", url: "/u" }} column="type" onClose={() => {}} />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Database down", variant: "destructive" }))
    );
  });
});

describe("ReportToolbar", () => {
  it("offers edit only to editors and toasts when the export fails", async () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <ReportToolbar reportId="r1" reportName="My report" canEdit={false} summary={<span>sum</span>} search="" onSearchChange={onSearchChange} />
    );
    expect(screen.queryByRole("link", { name: /edit/ })).not.toBeInTheDocument();
    rerender(<ReportToolbar reportId="r1" reportName="My report" canEdit grafanaUrl="https://g" summary={<span>sum</span>} search="" onSearchChange={onSearchChange} />);
    expect(screen.getByRole("link", { name: /edit/ })).toHaveAttribute("href", "/reports/r1/edit");
    expect(screen.getByRole("link", { name: /open/ })).toHaveAttribute("href", "https://g");

    mockFetch.mockResolvedValueOnce({ ok: false });
    await userEvent.click(screen.getByRole("button", { name: /exportCsv/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    await userEvent.type(screen.getByPlaceholderText("filterResults"), "q");
    expect(onSearchChange).toHaveBeenCalledWith("q");
  });
});
