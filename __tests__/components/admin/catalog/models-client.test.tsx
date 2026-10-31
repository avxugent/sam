import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  usePathname: () => "/admin/models",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const tFn = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { ModelsClient } from "@/components/admin/catalog/models-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

const TYPES = [{ id: "t1", name: "Laptop" }, { id: "t2", name: "Desktop" }];
const MANUFACTURERS = [{ id: "mf1", name: "Dell" }, { id: "mf2", name: "HP" }];
const LATITUDE = {
  id: "m1",
  name: "Latitude 5440",
  typeId: "t1",
  manufacturerId: "mf1",
  documentationUrl: null,
  type: TYPES[0],
  manufacturer: MANUFACTURERS[0],
  _count: { assets: 2, stockItems: 1 },
};
const OPTIPLEX = {
  id: "m2",
  name: "OptiPlex",
  typeId: "t2",
  manufacturerId: null,
  documentationUrl: "https://docs.example.com/optiplex",
  type: TYPES[1],
  manufacturer: null,
  _count: { assets: 0, stockItems: 0 },
};
const CLUSTER = [
  { id: "m1", model: "Latitude 5440", count: 2, typeName: "Laptop", manufacturerName: "Dell" },
  { id: "m3", model: "Latitude-5440", count: 1, typeName: "Laptop", manufacturerName: null },
];

function renderModels(props: Partial<Parameters<typeof ModelsClient>[0]> = {}) {
  return render(
    <ModelsClient
      initialModels={[LATITUDE, OPTIPLEX]}
      assetTypes={TYPES}
      manufacturers={MANUFACTURERS}
      initialClusters={[]}
      {...props}
    />
  );
}

/** The list row containing the model name button. */
function row(name: string) {
  return screen.getByRole("button", { name }).parentElement!.parentElement!.parentElement!;
}
/** Row buttons are [name, edit, delete]. */
const rowButtons = (name: string) => within(row(name)).getAllByRole("button");

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = "";
});

describe("ModelsClient list", () => {
  it("shows the empty state", () => {
    renderModels({ initialModels: [] });
    expect(screen.getByText("noModelsYet")).toBeInTheDocument();
  });

  it("renders type, manufacturer, usage and a missing-documentation warning", () => {
    renderModels();
    expect(within(row("Latitude 5440")).getByText("Laptop · Dell")).toBeInTheDocument();
    expect(within(row("Latitude 5440")).getByText("2 / 1")).toBeInTheDocument();
    expect(within(row("Latitude 5440")).getByLabelText("noDocumentationTooltip")).toBeInTheDocument();
    expect(within(row("OptiPlex")).getByText("Desktop")).toBeInTheDocument();
    expect(within(row("OptiPlex")).queryByLabelText("noDocumentationTooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OptiPlex" })).toBeDisabled();
  });

  it("hides the duplicates section when there are no clusters", () => {
    renderModels();
    expect(screen.queryByText("possibleDuplicates")).not.toBeInTheDocument();
  });
});

describe("ModelsClient filters", () => {
  it("pushes the type filter into the URL", async () => {
    renderModels();
    await pick(screen.getAllByRole("combobox")[0], "Laptop");
    expect(nav.push).toHaveBeenCalledWith("/admin/models?typeId=t1");
  });

  it("removes a filter when 'all' is picked, keeping the other one", async () => {
    nav.search = "typeId=t1&manufacturerId=mf1";
    renderModels();
    await pick(screen.getAllByRole("combobox")[1], "allManufacturers");
    expect(nav.push).toHaveBeenCalledWith("/admin/models?typeId=t1");
  });
});

describe("ModelsClient create/edit", () => {
  it("creates a model with the current filters preselected", async () => {
    nav.search = "typeId=t2&manufacturerId=mf2";
    mockFetch.mockResolvedValueOnce(json({ id: "m9" }));
    renderModels();
    await userEvent.click(screen.getByRole("button", { name: /addModel/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("newModel")).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "save" });
    expect(save).toBeDisabled();

    await userEvent.type(within(dialog).getByPlaceholderText("namePlaceholder"), "  EliteBook  ");
    await userEvent.type(within(dialog).getByPlaceholderText("documentationUrlPlaceholder"), "https://hp.example.com");
    await userEvent.click(save);

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "modelCreated" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/models");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      typeId: "t2",
      manufacturerId: "mf2",
      name: "EliteBook",
      documentationUrl: "https://hp.example.com",
    });
    expect(nav.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("requires a type before saving and sends null for no manufacturer and blank docs", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "m9" }));
    renderModels();
    await userEvent.click(screen.getByRole("button", { name: /addModel/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("namePlaceholder"), "ThinkPad");
    const save = within(dialog).getByRole("button", { name: "save" });
    expect(save).toBeDisabled();

    const [typeSelect, manufacturerSelect] = within(dialog).getAllByRole("combobox");
    await pick(typeSelect, "Laptop");
    await pick(manufacturerSelect, "HP");
    await pick(manufacturerSelect, "noManufacturer");
    await userEvent.click(save);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      typeId: "t1",
      manufacturerId: null,
      name: "ThinkPad",
      documentationUrl: null,
    });
  });

  it("edits a model with a PUT", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "m1" }));
    renderModels();
    await userEvent.click(rowButtons("Latitude 5440")[1]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("editModel")).toBeInTheDocument();
    const name = within(dialog).getByPlaceholderText("namePlaceholder");
    expect(name).toHaveValue("Latitude 5440");
    expect(within(dialog).getByPlaceholderText("documentationUrlPlaceholder")).toHaveValue("");
    await userEvent.type(name, " G2");
    await userEvent.click(within(dialog).getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "modelUpdated" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/models/m1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ typeId: "t1", manufacturerId: "mf1", name: "Latitude 5440 G2", documentationUrl: null });
  });

  it("prefills an edit without manufacturer and cancels without saving", async () => {
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[1]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByPlaceholderText("documentationUrlPlaceholder")).toHaveValue("https://docs.example.com/optiplex");
    expect(within(dialog).getAllByRole("combobox")[1]).toHaveTextContent("noManufacturer");
    await userEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("toasts the API error and keeps the dialog open", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid input", details: ["name too long"] }, false, 400));
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[1]);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Invalid input: name too long", variant: "destructive" })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("does not offer a merge when a create collides with a name", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Name taken", code: "nameConflict", existingId: "m1" }, false, 409));
    nav.search = "typeId=t1";
    renderModels();
    await userEvent.click(screen.getByRole("button", { name: /addModel/ }));
    await userEvent.type(within(screen.getByRole("dialog")).getByPlaceholderText("namePlaceholder"), "Latitude 5440");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Name taken" })));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("ModelsClient rename conflict merge", () => {
  const conflict = { error: "Name taken", code: "nameConflict", existingId: "m1", existingName: "Latitude 5440" };

  async function renameOptiPlexOntoLatitude() {
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[1]);
    const name = within(screen.getByRole("dialog")).getByPlaceholderText("namePlaceholder");
    await userEvent.clear(name);
    await userEvent.type(name, "Latitude 5440");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "save" }));
    return screen.findByRole("alertdialog");
  }

  it("offers to merge into the existing model and merges on confirm", async () => {
    mockFetch.mockResolvedValueOnce(json(conflict, false, 409));
    const alert = await renameOptiPlexOntoLatitude();
    expect(within(alert).getByText('mergeDescription:{"from":"OptiPlex"}')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce(json({ ok: true, assetsMoved: 0, stockItemsMoved: 0 }));
    await userEvent.click(within(alert).getByRole("button", { name: "mergeSubmit" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "modelMerged", description: 'mergeSummary:{"assets":0,"stock":0}' })
    );
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("/api/models/m2/merge");
    expect(JSON.parse(init.body)).toEqual({ targetId: "m1" });
    expect(nav.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the edit dialog open when the merge fails", async () => {
    mockFetch.mockResolvedValueOnce(json(conflict, false, 409));
    const alert = await renameOptiPlexOntoLatitude();
    mockFetch.mockResolvedValueOnce(json({ error: "Merge failed" }, false, 500));
    await userEvent.click(within(alert).getByRole("button", { name: "mergeSubmit" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Merge failed", variant: "destructive" })
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("cancels the merge offer", async () => {
    mockFetch.mockResolvedValueOnce(json(conflict, false, 409));
    const alert = await renameOptiPlexOntoLatitude();
    await userEvent.click(within(alert).getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("ModelsClient delete", () => {
  it("deletes an unused model", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[2]);
    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText("deleteConfirmDescription")).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "delete" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "OptiPlex" })).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/models/m2", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "modelDeleted" });
  });

  it("blocks deleting a model that is in use", async () => {
    renderModels();
    await userEvent.click(rowButtons("Latitude 5440")[2]);
    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText('inUseDescription:{"assets":2,"stockItems":1}')).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "delete" })).toBeDisabled();
  });

  it("keeps the model and toasts when the delete fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Still referenced" }, false, 409));
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[2]);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Still referenced", variant: "destructive" })
    );
    expect(screen.getByRole("button", { name: "OptiPlex" })).toBeInTheDocument();
  });

  it("falls back to a generic message when the failed delete has no error body", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModels();
    await userEvent.click(rowButtons("OptiPlex")[2]);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" })
    );
  });
});

describe("ModelsClient usage drilldown", () => {
  it("lists the assets and stock items using the model", async () => {
    mockFetch.mockResolvedValueOnce(
      json({
        assets: [
          { id: "a1", serialNumber: "SN-1", hostname: null, status: "IN_USE", location: { id: "l1", name: "Room 1" } },
          { id: "a2", serialNumber: null, hostname: "pc-02", status: "IN_USE", location: null },
          { id: "a3", serialNumber: null, hostname: null, status: "IN_USE", location: null },
        ],
        stockItems: [
          { id: "s1", serialNumber: null, quantity: 4, location: { id: "l2", name: "Store" } },
          { id: "s2", serialNumber: "SN-S", quantity: 1, location: null },
        ],
      })
    );
    renderModels();
    await userEvent.click(screen.getByRole("button", { name: "Latitude 5440" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Latitude 5440")).toBeInTheDocument();

    expect(await within(dialog).findByText("Assets (3)")).toBeInTheDocument();
    expect(within(dialog).getByText("SN-1")).toBeInTheDocument();
    expect(within(dialog).getByText("Room 1")).toBeInTheDocument();
    expect(within(dialog).getByText("pc-02")).toBeInTheDocument();
    expect(within(dialog).getByText("a3")).toBeInTheDocument();
    expect(within(dialog).getByText("Stock (2)")).toBeInTheDocument();
    expect(within(dialog).getByText("×4")).toBeInTheDocument();
    expect(within(dialog).getByText("Store")).toBeInTheDocument();
    expect(within(dialog).getByText("SN-S")).toBeInTheDocument();
    expect(within(dialog).getAllByText("—")).toHaveLength(3);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/models/m1/usage");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens from the usage badge and shows nothing when the lookup fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "boom" }, false, 500));
    renderModels();
    await userEvent.click(screen.getByText("2 / 1"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/models/m1/usage", undefined));
    await waitFor(() => expect(within(dialog).queryByText(/Assets \(/)).not.toBeInTheDocument());
    expect(within(dialog).queryByText(/Stock \(/)).not.toBeInTheDocument();
  });
});

describe("ModelsClient possible duplicates", () => {
  it("lists clusters and merges the second model into the first", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true, assetsMoved: 1, stockItemsMoved: 2 }));
    renderModels({ initialClusters: [CLUSTER] });
    expect(screen.getByText("possibleDuplicates")).toBeInTheDocument();
    expect(screen.getByText("(Laptop / Dell)")).toBeInTheDocument();
    expect(screen.getByText("(Laptop)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "mergeButton" }));
    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText('mergeDescription:{"from":"Latitude-5440"}')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "mergeSubmit" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "modelMerged", description: 'mergeSummary:{"assets":1,"stock":2}' })
    );
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/models/m3/merge");
    expect(JSON.parse(init.body)).toEqual({ targetId: "m1" });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("does not refresh when the duplicate merge fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Merge failed" }, false, 500));
    renderModels({ initialClusters: [CLUSTER] });
    await userEvent.click(screen.getByRole("button", { name: "mergeButton" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "mergeSubmit" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Merge failed" })));
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("cancels the duplicate merge", async () => {
    renderModels({ initialClusters: [CLUSTER] });
    await userEvent.click(screen.getByRole("button", { name: "mergeButton" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
