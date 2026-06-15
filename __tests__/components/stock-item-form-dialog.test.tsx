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
    if (url === "/api/manufacturers") return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
    return Promise.resolve(jsonResp({}));
  });
});

const EDIT_DATA: StockItemInitialData = {
  typeId: "at1",
  typeName: "Laptop",
  manufacturerId: "m1",
  manufacturerName: "Dell",
  model: "U2720Q",
  serialNumber: null,
  quantity: 5,
  notes: "spare",
  invoiceNumber: null,
  invoiceDate: null,
  macAddress: null,
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
    expect(mockFetch).toHaveBeenCalledWith("/api/manufacturers");
  });

  it("blocks submit and shows validation errors when required fields are empty", async () => {
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "createSubmit" }));
    expect(await screen.findByText("errTypeRequired")).toBeInTheDocument();
    expect(screen.getByText("errModelRequired")).toBeInTheDocument();
    // no POST attempted
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
      if (url === "/api/manufacturers") return Promise.resolve(jsonResp([{ id: "m1", name: "Dell" }]));
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
