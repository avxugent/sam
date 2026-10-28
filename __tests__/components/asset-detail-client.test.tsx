import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string, values?: Record<string, unknown>) => (values?.name ? `${key}:${values.name}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Child dialogs have their own tests; render only their trigger here.
vi.mock("@/components/assets/asset-form-dialog", () => ({
  AssetFormDialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/assets/remove-asset-dialog", () => ({
  RemoveAssetDialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/assets/move-asset-dialog", () => ({ MoveAssetDialog: () => null }));
vi.mock("@/components/assets/asset-history-timeline", () => ({ AssetHistoryTimeline: () => null }));
vi.mock("@/components/attachments/attachment-gallery", () => ({ AttachmentGallery: () => null }));

import { AssetDetailClient } from "@/components/assets/asset-detail-client";

const ASSET = {
  id: "a1",
  locationId: "l1",
  model: { id: "m1", name: "Pearl-2", documentationUrl: null },
  serialNumber: "SN1",
  hostname: "rec01.example.org",
  quantity: 1,
  status: "INSTALLED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  type: { id: "t1", name: "Recorder" },
  manufacturer: { id: "mf1", name: "Epiphan" },
  macAddresses: [{ id: "mac1", address: "AA:BB:CC:DD:EE:FF" }],
  customFields: [],
  location: { id: "l1", name: "Room 1" },
  attachments: [],
};

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function renderAsset(overrides: Partial<typeof ASSET> & Record<string, unknown> = {}, userRole = "EDITOR", extra = {}) {
  return render(
    <AssetDetailClient
      asset={{ ...ASSET, ...overrides } as never}
      breadcrumbs={[{ id: "l1", name: "Room 1" }]}
      userRole={userRole as never}
      {...extra}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssetDetailClient", () => {
  it("shows no edit actions to a viewer", () => {
    renderAsset({}, "VIEWER");
    expect(screen.getByRole("heading", { name: "Pearl-2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /removeAsset/ })).not.toBeInTheDocument();
  });

  it("offers edit, move and remove on an installed asset", () => {
    renderAsset();
    for (const name of [/edit/, /moveAssetButton/, /removeAsset/]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("keeps only remove while the asset is in repair, with the repair banner", () => {
    renderAsset({ status: "IN_REPAIR", repairNote: "Fan noise" }, "EDITOR", { sentForRepairByName: "Ada" });
    expect(screen.getByText("bannerLabel")).toBeInTheDocument();
    expect(screen.getByText("sentForRepairBy:Ada")).toBeInTheDocument();
    expect(screen.getByText("Fan noise")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /moveAssetButton/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /removeAsset/ })).toBeInTheDocument();
  });

  it("lets an admin reinstate a decommissioned asset", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderAsset({ status: "DECOMMISSIONED", decommissionNote: "Broken screen" }, "ADMIN");
    expect(screen.queryByRole("button", { name: /removeAsset/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /reinstate/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "reinstate" }).at(-1)!);

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith("/api/assets/a1/reinstate", { method: "POST" });
    expect(mockToast).toHaveBeenCalledWith({ title: "reinstated" });
  });

  it("shows the API error when reinstating fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Asset is not decommissioned." }) });
    renderAsset({ status: "DECOMMISSIONED" }, "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: /reinstate/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "reinstate" }).at(-1)!);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Asset is not decommissioned." }))
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("does not offer reinstate to an editor", () => {
    renderAsset({ status: "DECOMMISSIONED" }, "EDITOR");
    expect(screen.queryByRole("button", { name: /reinstate/ })).not.toBeInTheDocument();
  });

  it("links the hostname through the configured template", () => {
    renderAsset({}, "VIEWER", { hostnameUrlTemplate: "https://grafana.example.org/d?host={hostname}" });
    expect(screen.getByRole("link", { name: /rec01\.example\.org/ })).toHaveAttribute(
      "href",
      "https://grafana.example.org/d?host=rec01.example.org"
    );
  });
});
