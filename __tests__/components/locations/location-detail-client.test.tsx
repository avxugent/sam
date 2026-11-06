import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/locations/l1" }));
// Heavy children have their own tests (or none worth rendering here).
vi.mock("@/components/locations/location-form-dialog", () => ({
  LocationFormDialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/assets/asset-form-dialog", () => ({
  AssetFormDialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/locations/move-location-dialog", () => ({ MoveLocationDialog: () => null }));
vi.mock("@/components/assets/asset-table", () => ({ AssetTable: () => null }));
vi.mock("@/components/attachments/attachment-gallery", () => ({ AttachmentGallery: () => null }));
vi.mock("@/components/locations/cover-image-picker", () => ({ CoverImagePicker: () => null }));
vi.mock("@/components/locations/location-map", () => ({ LocationMap: () => null }));
vi.mock("@/components/locations/work-log-list", () => ({ WorkLogList: () => null }));

import { LocationDetailClient } from "@/components/locations/location-detail-client";

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    name: "Room 013",
    fiNumber: "14.10.100.013",
    parent: { id: "b1", name: "Building 10" },
    children: [],
    attachments: [],
    inMaintenance: false,
    _count: { assets: 2, children: 0, attachments: 0 },
    ...overrides,
  };
}

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const ok = () => ({ ok: true, json: async () => ({}) }) as Response;

function renderLocation(loc = location(), userRole = "EDITOR") {
  return render(
    <LocationDetailClient
      location={loc as never}
      assets={[]}
      subtreeInstalledUnits={2}
      breadcrumbs={[{ id: "b1", name: "Building 10" }]}
      userRole={userRole as never}
      currentUserId="u1"
      showLocation={false}
      defaultTab="assets"
      hostnameUrlTemplate=""
      locationUrlTemplate=""
      workLogs={[]}
      users={[]}
      workLogItems={[]}
      jiraBaseUrl={null}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocationDetailClient", () => {
  it("hides the edit actions from a viewer", () => {
    renderLocation(location(), "VIEWER");
    expect(screen.queryByRole("button", { name: /startMaintenance/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/ })).not.toBeInTheDocument();
  });

  it("puts a room into maintenance and shows the badge", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderLocation();
    await userEvent.click(screen.getByRole("button", { name: /startMaintenance/ }));

    expect(await screen.findByText("inMaintenance")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/locations/l1", expect.objectContaining({ method: "PUT", body: JSON.stringify({ inMaintenance: true }) }));
    expect(mockToast).toHaveBeenCalledWith({ title: "maintenanceEnabled" });
    expect(screen.getByRole("button", { name: /endMaintenance/ })).toBeInTheDocument();
  });

  it("offers maintenance only on rooms (no sub-locations)", () => {
    renderLocation(location({ _count: { assets: 0, children: 2, attachments: 0 } }));
    expect(screen.queryByRole("button", { name: /startMaintenance/ })).not.toBeInTheDocument();
  });

  it("deletes a leaf location and returns to its parent", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderLocation();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "delete" }).at(-1)!);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/locations/b1"));
    expect(mockFetch).toHaveBeenCalledWith("/api/locations/l1", { method: "DELETE" });
  });

  it("offers an editor no delete for a location with sub-locations (cascade is Admin-only)", () => {
    renderLocation(location({ _count: { assets: 0, children: 2, attachments: 0 } }), "EDITOR");
    expect(screen.queryByRole("button", { name: /^delete$/ })).not.toBeInTheDocument();
  });

  it("requires the cascade confirmation before deleting a subtree", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderLocation(location({ _count: { assets: 0, children: 2, attachments: 0 } }), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: /^delete$/ }));
    const confirm = screen.getAllByRole("button", { name: "delete" }).at(-1)!;
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(confirm);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/locations/l1?cascade=true", { method: "DELETE" }));
  });

  it("explains a delete refused because stock is still stored there", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Stock items are still stored at this location or below it.", code: "hasStock" }) } as Response);
    renderLocation();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "delete" }).at(-1)!);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "deleteHasStock" })));
    expect(router.push).not.toHaveBeenCalled();
  });
});
