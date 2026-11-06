import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
  usePathname: () => "/",
}));
const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { MoveLocationDialog } from "@/components/locations/move-location-dialog";

// Campus > { Building A > Room, Building B }
const TREE = [
  { id: "l1", name: "Campus", parentId: null, children: [
    { id: "l2", name: "Building A", parentId: "l1", children: [
      { id: "l3", name: "Room", parentId: "l2", children: [] },
    ] },
    { id: "l4", name: "Building B", parentId: "l1", children: [] },
  ] },
];

// Move Building A (l2); current parent is Campus (l1)
function renderOpen(props = {}) {
  return render(
    <MoveLocationDialog
      open
      onOpenChange={vi.fn()}
      locationId="l2"
      locationName="Building A"
      currentParentId="l1"
      assetCount={0}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === "/api/locations" && !opts) return Promise.resolve({ ok: true, json: async () => TREE });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe("<MoveLocationDialog />", () => {
  it("excludes the location itself, its descendants, and its current parent", async () => {
    renderOpen();
    expect(await screen.findByRole("button", { name: /Building B/ })).toBeInTheDocument();
    // self (Building A) and its descendant (Room) are invalid targets
    expect(screen.queryByRole("button", { name: /Building A/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Room/ })).not.toBeInTheDocument();
    // current parent (Campus) is excluded — moving there is a no-op.
    // (Building B's breadcrumb contains "Campus", so match the bare name exactly.)
    expect(screen.queryByRole("button", { name: "Campus" })).not.toBeInTheDocument();
  });

  it("PUTs the new parentId directly when there are no assets", async () => {
    const user = userEvent.setup();
    renderOpen({ assetCount: 0 });
    const moveBtn = await screen.findByRole("button", { name: "moveToLocationButton" });
    expect(moveBtn).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Building B/ }));
    await user.click(moveBtn);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/locations/l2", expect.objectContaining({ method: "PUT" }))
    );
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[0] === "/api/locations/l2")![1].body);
    expect(body.parentId).toBe("l4");
  });

  it("asks to confirm moving assigned assets before PUTting", async () => {
    const user = userEvent.setup();
    renderOpen({ assetCount: 5 });
    await screen.findByRole("button", { name: "moveToLocationButton" });
    await user.click(screen.getByRole("button", { name: /Building B/ }));
    await user.click(screen.getByRole("button", { name: "moveToLocationButton" }));
    // confirmation appears; no PUT yet
    const confirmBtn = await screen.findByRole("button", { name: "moveWithAssets" });
    expect(mockFetch).not.toHaveBeenCalledWith("/api/locations/l2", expect.objectContaining({ method: "PUT" }));
    await user.click(confirmBtn);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/locations/l2", expect.objectContaining({ method: "PUT" }))
    );
  });

  it("shows a destructive toast when the move fails", async () => {
    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === "/api/locations" && !opts) return Promise.resolve({ ok: true, json: async () => TREE });
      return Promise.resolve({ ok: false, json: async () => ({ error: "Nope" }) });
    });
    const user = userEvent.setup();
    renderOpen({ assetCount: 0 });
    await screen.findByRole("button", { name: "moveToLocationButton" });
    await user.click(screen.getByRole("button", { name: /Building B/ }));
    await user.click(screen.getByRole("button", { name: "moveToLocationButton" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Nope" }))
    );
  });
});
