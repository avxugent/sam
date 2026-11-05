import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
}));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: vi.fn(),
}));

import { ModelUsageDialog } from "@/components/admin/catalog/model-usage-dialog";
import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const USAGE = {
  assets: [
    { id: "a1", serialNumber: "SN1", hostname: "pc1", status: "ACTIVE", location: { id: "l1", name: "Room 1" } },
    { id: "a2", serialNumber: null, hostname: "pc2", status: "ACTIVE", location: null },
    { id: "a3", serialNumber: null, hostname: null, status: "ACTIVE", location: null },
  ],
  stockItems: [
    { id: "s1", serialNumber: "STK1", quantity: 1, location: { id: "l2", name: "Store" } },
    { id: "s2", serialNumber: null, quantity: 4, location: null },
  ],
};

const MODEL = { id: "m1", name: "Latitude" };

beforeEach(() => vi.clearAllMocks());

describe("ModelUsageDialog", () => {
  it("renders nothing and fetches nothing without a model", () => {
    render(<ModelUsageDialog model={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("lists the assets and stock items using the model", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: USAGE });
    render(<ModelUsageDialog model={MODEL} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Latitude" })).toBeInTheDocument();
    expect(await screen.findByText('usageAssets:{"count":3}')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/models/m1/usage");
    // serial, else hostname, else id
    expect(screen.getByText("SN1")).toBeInTheDocument();
    expect(screen.getByText("pc2")).toBeInTheDocument();
    expect(screen.getByText("a3")).toBeInTheDocument();
    expect(screen.getByText("Room 1")).toBeInTheDocument();
    expect(screen.getByText('usageStock:{"count":2}')).toBeInTheDocument();
    expect(screen.getByText("STK1")).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("omits empty sections", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: { assets: [], stockItems: USAGE.stockItems } });
    render(<ModelUsageDialog model={MODEL} onClose={vi.fn()} />);
    expect(await screen.findByText("STK1")).toBeInTheDocument();
    expect(screen.queryByText(/usageAssets/)).not.toBeInTheDocument();
  });

  it("shows a spinner while loading", async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<ModelUsageDialog model={MODEL} onClose={vi.fn()} />);
    expect(within(screen.getByRole("dialog")).getByRole("status", { name: "loading" })).toBeInTheDocument();
  });

  it("toasts a failed load instead of showing the model as unused", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, error: { error: "DB down" } });
    render(<ModelUsageDialog model={MODEL} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "error", description: "DB down", variant: "destructive" })),
    );
    expect(within(screen.getByRole("dialog")).queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a superseded response when the model changes", async () => {
    let resolveFirst!: (v: Awaited<ReturnType<typeof apiFetch>>) => void;
    mockApiFetch
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ ok: true, status: 200, data: { assets: [USAGE.assets[1]], stockItems: [] } });
    const { rerender } = render(<ModelUsageDialog model={MODEL} onClose={vi.fn()} />);
    rerender(<ModelUsageDialog model={{ id: "m2", name: "OptiPlex" }} onClose={vi.fn()} />);
    expect(await screen.findByText("pc2")).toBeInTheDocument();
    resolveFirst({ ok: true, status: 200, data: USAGE });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("SN1")).not.toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenLastCalledWith("/api/models/m2/usage");
  });

  it("calls onClose when dismissed", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: USAGE });
    const onClose = vi.fn();
    render(<ModelUsageDialog model={MODEL} onClose={onClose} />);
    await screen.findByText("SN1");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
