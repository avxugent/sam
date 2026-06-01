import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { DeployStockDialog } from "@/components/stock/deploy-stock-dialog";

const LOC_TREE = [
  { id: "l1", name: "Campus", parentId: null, children: [{ id: "l2", name: "Room 2", parentId: "l1", children: [] }] },
];

function renderOpen(props: Partial<React.ComponentProps<typeof DeployStockDialog>> = {}) {
  return render(
    <DeployStockDialog
      open
      onOpenChange={vi.fn()}
      itemId="s1"
      itemModel="XPS"
      itemSerial={null}
      availableQuantity={10}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === "/api/locations" && !opts) return Promise.resolve({ ok: true, json: async () => LOC_TREE });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe("<DeployStockDialog />", () => {
  it("loads and flattens the location tree", async () => {
    renderOpen();
    expect((await screen.findAllByText("Campus")).length).toBeGreaterThan(0);
    expect(screen.getByText("Room 2")).toBeInTheDocument();
  });

  it("disables deploy until a location is picked, then POSTs to the deploy endpoint", async () => {
    const user = userEvent.setup();
    renderOpen();
    await screen.findByText("Room 2");
    const deployBtn = screen.getByRole("button", { name: "deployTo" });
    expect(deployBtn).toBeDisabled();

    await user.click(screen.getByText("Room 2"));
    expect(deployBtn).not.toBeDisabled();
    await user.click(deployBtn);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/stock/s1/deploy", expect.objectContaining({ method: "POST" }))
    );
    const body = JSON.parse(mockFetch.mock.calls.find((c) => c[0] === "/api/stock/s1/deploy")![1].body);
    expect(body.locationId).toBe("l2");
    expect(body.quantity).toBe(1);
  });

  it("surfaces a destructive toast when deploy fails", async () => {
    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === "/api/locations" && !opts) return Promise.resolve({ ok: true, json: async () => LOC_TREE });
      return Promise.resolve({ ok: false, json: async () => ({ error: "Out of stock" }) });
    });
    const user = userEvent.setup();
    renderOpen();
    await screen.findByText("Room 2");
    await user.click(screen.getByText("Room 2"));
    await user.click(screen.getByRole("button", { name: "deployTo" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Out of stock" })
      )
    );
  });

  it("filters locations by the search box", async () => {
    const user = userEvent.setup();
    renderOpen();
    await screen.findByText("Room 2");
    await user.type(screen.getByPlaceholderText("searchLocations"), "zzz-no-match");
    expect(screen.queryByText("Room 2")).not.toBeInTheDocument();
    expect(screen.getByText("noLocationsFound")).toBeInTheDocument();
  });

  it("shows the serial number for a serialized item", async () => {
    renderOpen({ itemSerial: "SN-9" });
    expect(await screen.findByText("SN-9")).toBeInTheDocument();
  });
});
