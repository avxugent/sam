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

import { StockItemFormDialog, type StockItemInitialData } from "@/components/stock/stock-item-form-dialog";

function jsonResp(data: unknown) {
  return { ok: true, json: async () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  // dropdown fetches on open + submit fetch
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/asset-types") return Promise.resolve(jsonResp([{ id: "at1", name: "Laptop" }]));
    if (url.startsWith("/api/manufacturers")) return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
    if (url === "/api/locations") {
      return Promise.resolve(jsonResp([
        { id: "loc1", name: "Room A", parentId: null, _count: { stockItems: 1 } },
      ]));
    }
    if (url.startsWith("/api/models")) {
      return Promise.resolve(jsonResp([{ id: "mo1", name: "U2720Q", typeId: "at1", manufacturerId: "m1" }]));
    }
    return Promise.resolve(jsonResp({}));
  });
});

const EDIT_DATA: StockItemInitialData = {
  typeId: "at1",
  typeName: "Laptop",
  manufacturerId: "m1",
  manufacturerName: "Dell",
  modelId: "mo1",
  serialNumber: null,
  quantity: 5,
  notes: "spare",
  locationId: "loc1",
  locationBreadcrumb: "Room A",
  invoiceNumber: null,
  invoiceDate: null,
  macAddresses: [],
};

async function openCreate() {
  const user = userEvent.setup();
  render(
    <StockItemFormDialog mode="create">
      <button>Add stock</button>
    </StockItemFormDialog>
  );
  await user.click(screen.getByRole("button", { name: "Add stock" }));
  return user;
}

describe("<StockItemFormDialog /> create", () => {
  it("opens on trigger click and shows the create title", async () => {
    await openCreate();
    expect(screen.getByText("addItem")).toBeInTheDocument();
  });

  it("loads dropdown options from the API when opened", async () => {
    await openCreate();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/asset-types"));
    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([url]) => (url as string).startsWith("/api/manufacturers"))).toBe(true)
    );
    expect(mockFetch).toHaveBeenCalledWith("/api/locations");
  });

  it("defaults the storage location to Unassigned and lets you pick one from the list", async () => {
    const user = await openCreate();
    // label above the picker + the "Unassigned" list row itself both read "unassigned"
    expect(screen.getAllByText("unassigned").length).toBe(2);

    await user.click(await screen.findByText("Room A"));
    // label now reads the picked location's breadcrumb; only the list row still says "unassigned"
    expect(screen.getAllByText("unassigned").length).toBe(1);
    expect(screen.getAllByText("Room A").length).toBeGreaterThan(0);
  });

  it("hides locations with no stock by default, revealed via the show-all toggle", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/asset-types") return Promise.resolve(jsonResp([{ id: "at1", name: "Laptop" }]));
      if (url.startsWith("/api/manufacturers")) return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
      if (url === "/api/locations") {
        return Promise.resolve(jsonResp([
          { id: "loc1", name: "Room A", parentId: null, _count: { stockItems: 1 } },
          { id: "loc2", name: "Room B", parentId: null, _count: { stockItems: 0 } },
        ]));
      }
      return Promise.resolve(jsonResp({}));
    });
    const user = await openCreate();

    await screen.findByText("Room A");
    expect(screen.queryByText("Room B")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "showAllLocations" }));
    expect(await screen.findByText("Room B")).toBeInTheDocument();
  });

  it("blocks submit and shows validation errors when required fields are empty", async () => {
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "createSubmit" }));
    expect(await screen.findByText("errTypeRequired")).toBeInTheDocument();
    expect(screen.getByText("errModelRequired")).toBeInTheDocument();
    // no POST attempted
    expect(mockFetch).not.toHaveBeenCalledWith("/api/stock", expect.anything());
  });

  it("shows model suggestions scoped from /api/models and fills the exact stored spelling on pick", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/asset-types") return Promise.resolve(jsonResp([{ id: "at1", name: "Laptop" }]));
      if (url.startsWith("/api/manufacturers")) return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
      if (url === "/api/locations") return Promise.resolve(jsonResp([{ id: "loc1", name: "Room A", parentId: null }]));
      if (url.startsWith("/api/models")) {
        return Promise.resolve(
          jsonResp([{ id: "mo1", name: "Dell UltraSharp U2722D", typeId: "at1", manufacturerId: "m1" }])
        );
      }
      return Promise.resolve(jsonResp({}));
    });

    const user = await openCreate();
    const modelInput = screen.getByPlaceholderText("modelPlaceholder");
    await user.click(modelInput);

    const suggestion = await screen.findByText("Dell UltraSharp U2722D");
    await user.click(suggestion);

    expect(modelInput).toHaveValue("Dell UltraSharp U2722D");
  });

  it("auto-punctuates the MAC address field as you type", async () => {
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "add" }));
    const macInput = screen.getByLabelText("macAddress 1");
    await user.type(macInput, "aabbccddeeff");
    expect(macInput).toHaveValue("AA:BB:CC:DD:EE:FF");
  });

  it("blocks submit when a MAC address is incomplete", async () => {
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "add" }));
    await user.type(screen.getByLabelText("macAddress 1"), "AA:BB:CC");
    await user.click(screen.getByRole("button", { name: "createSubmit" }));
    expect(await screen.findByText(/errMacInvalid/)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith("/api/stock", expect.anything());
  });
});

describe("<StockItemFormDialog /> edit", () => {
  async function openEdit() {
    const user = userEvent.setup();
    render(
      <StockItemFormDialog mode="edit" itemId="s1" initialData={EDIT_DATA}>
        <button>Edit</button>
      </StockItemFormDialog>
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    return user;
  }

  it("pre-fills fields from initialData", async () => {
    await openEdit();
    expect(screen.getByText("editItem")).toBeInTheDocument();
    expect(screen.getByDisplayValue("U2720Q")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getAllByText("Room A").length).toBeGreaterThan(0);
  });

  it("submits every MAC address in the list", async () => {
    const user = await openEdit();
    await user.click(screen.getByRole("button", { name: "add" }));
    await user.type(screen.getByLabelText("macAddress 1"), "AA:BB:CC:DD:EE:FF");
    await user.click(screen.getByRole("button", { name: "add" }));
    await user.type(screen.getByLabelText("macAddress 2"), "11-22-33-44-55-66");
    await user.click(screen.getByRole("button", { name: "updateSubmit" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/stock/s1", expect.objectContaining({ method: "PUT" }))
    );
    const [, init] = mockFetch.mock.calls.find(([url]) => url === "/api/stock/s1")!;
    expect(JSON.parse(init.body).macAddresses).toEqual(["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"]);
  });

  it("PUTs to /api/stock/:id and refreshes on success", async () => {
    const user = await openEdit();
    await user.click(screen.getByRole("button", { name: "updateSubmit" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/stock/s1", expect.objectContaining({ method: "PUT" }))
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "stockItemUpdated" }));
  });

  it("shows a destructive toast when the API rejects the update", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/asset-types") return Promise.resolve(jsonResp([{ id: "at1", name: "Laptop" }]));
      if (url.startsWith("/api/manufacturers")) return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
      if (url === "/api/locations") return Promise.resolve(jsonResp([{ id: "loc1", name: "Room A", parentId: null }]));
      return Promise.resolve({ ok: false, json: async () => ({ error: "Boom" }) });
    });
    const user = await openEdit();
    await user.click(screen.getByRole("button", { name: "updateSubmit" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Boom" })
      )
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
