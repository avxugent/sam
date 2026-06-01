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

import { MoveAssetDialog } from "@/components/assets/move-asset-dialog";

const TREE = [
  { id: "l1", name: "Campus", parentId: null, children: [
    { id: "l2", name: "Room 2", parentId: "l1", children: [] },
    { id: "l3", name: "Room 3", parentId: "l1", children: [] },
  ] },
];

function renderOpen(props = {}) {
  return render(
    <MoveAssetDialog
      open
      onOpenChange={vi.fn()}
      assetId="a1"
      assetName="XPS"
      currentLocationId="l2"
      currentLocationName="Room 2"
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

describe("<MoveAssetDialog />", () => {
  it("loads locations and excludes the current location", async () => {
    renderOpen();
    expect(await screen.findByRole("button", { name: /Room 3/ })).toBeInTheDocument();
    // current location (Room 2) is filtered out of the pick list
    expect(screen.queryByRole("button", { name: /Room 2/ })).not.toBeInTheDocument();
  });

  it("disables move until a target is picked, then PUTs the new locationId", async () => {
    const user = userEvent.setup();
    renderOpen();
    await screen.findByRole("button", { name: /Room 3/ });
    const moveBtn = screen.getByRole("button", { name: "moveToLocation" });
    expect(moveBtn).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Room 3/ }));
    expect(moveBtn).not.toBeDisabled();
    await user.click(moveBtn);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/assets/a1", expect.objectContaining({ method: "PUT" }))
    );
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[0] === "/api/assets/a1")![1].body);
    expect(body.locationId).toBe("l3");
  });

  it("filters the location list via search", async () => {
    const user = userEvent.setup();
    renderOpen();
    await screen.findByRole("button", { name: /Room 3/ });
    await user.type(screen.getByPlaceholderText("searchLocations"), "Room 3");
    expect(screen.getByRole("button", { name: /Room 3/ })).toBeInTheDocument();
    // sibling that doesn't match the query is filtered out
    expect(screen.queryByRole("button", { name: /Room 2/ })).not.toBeInTheDocument();
  });

  it("shows a destructive toast when the move fails", async () => {
    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === "/api/locations" && !opts) return Promise.resolve({ ok: true, json: async () => TREE });
      return Promise.resolve({ ok: false, json: async () => ({ error: "Nope" }) });
    });
    const user = userEvent.setup();
    renderOpen();
    await screen.findByRole("button", { name: /Room 3/ });
    await user.click(screen.getByRole("button", { name: /Room 3/ }));
    await user.click(screen.getByRole("button", { name: "moveToLocation" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Nope" }))
    );
  });
});
