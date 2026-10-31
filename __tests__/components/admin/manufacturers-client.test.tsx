import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
}));
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { ManufacturersClient } from "@/components/admin/manufacturers-client";

const ACME = { id: "m1", name: "Acme", _count: { assets: 2 } };
const BOLT = { id: "m2", name: "Bolt", _count: { assets: 0 } };
const CORE = { id: "m3", name: "Core", _count: { assets: 1 } };

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function names() {
  return screen.getAllByText(/^(Acme|Bolt|Core|Delta|Aardvark|Zeta)$/).map((el) => el.textContent);
}

function renderClient(items = [ACME, BOLT, CORE]) {
  return render(<ManufacturersClient initialManufacturers={items} />);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockToast.mockReset();
});

describe("ManufacturersClient", () => {
  it("shows the empty state", () => {
    renderClient([]);
    expect(screen.getByText("emptyList")).toBeInTheDocument();
  });

  it("shows asset counts and offers a drilldown only for used manufacturers", () => {
    renderClient();
    expect(screen.getByText("2 assets")).toBeInTheDocument();
    expect(screen.getByText("1 asset")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "viewAssetsFrom(2,Acme)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /viewAssetsFrom\(0,Bolt\)/ })).not.toBeInTheDocument();
  });

  it("opens the asset drilldown for a manufacturer", async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "viewAssetsFrom(2,Acme)" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/manufacturers/m1/assets", undefined));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("disables Add until a name is typed", async () => {
    renderClient();
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("addNewManufacturer"), "   ");
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("addNewManufacturer"), "{Enter}");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a manufacturer, keeps the list sorted and clears the input", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "m4", name: "Aardvark", _count: { assets: 0 } }));
    renderClient();
    const input = screen.getByPlaceholderText("addNewManufacturer");
    await userEvent.type(input, "  Aardvark  ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(names()).toEqual(["Aardvark", "Acme", "Bolt", "Core"]));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/manufacturers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Aardvark" });
    expect(input).toHaveValue("");
    expect(mockToast).toHaveBeenCalledWith({ title: "manufacturerCreated" });
  });

  it("creates on Enter and toasts an API error without changing the list", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Name already exists" }, false, 409));
    renderClient();
    const input = screen.getByPlaceholderText("addNewManufacturer");
    await userEvent.type(input, "Acme{Enter}");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Name already exists", variant: "destructive" }),
    );
    expect(input).toHaveValue("Acme");
    expect(names()).toEqual(["Acme", "Bolt", "Core"]);
  });

  it("renames a manufacturer and re-sorts the list", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "m1", name: "Zeta" }));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "renameItem(Acme)" }));
    const input = screen.getByDisplayValue("Acme");
    await userEvent.clear(input);
    await userEvent.type(input, " Zeta ");
    await userEvent.click(screen.getByRole("button", { name: "saveName" }));

    await waitFor(() => expect(names()).toEqual(["Bolt", "Core", "Zeta"]));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/manufacturers/m1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ name: "Zeta" });
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith({ title: "manufacturerUpdated" });
  });

  it("ignores an empty rename, and cancels with the button or Escape", async () => {
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "renameItem(Bolt)" }));
    const input = screen.getByDisplayValue("Bolt");
    await userEvent.clear(input);
    await userEvent.type(input, "{Enter}");
    expect(mockFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "cancelRename" }));
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "renameItem(Bolt)" }));
    await userEvent.type(screen.getByDisplayValue("Bolt"), "{Escape}");
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();
    expect(names()).toEqual(["Acme", "Bolt", "Core"]);
  });

  it("toasts a rename error that is not a name conflict", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid input", details: ["name too long"] }, false, 400));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "renameItem(Bolt)" }));
    await userEvent.type(screen.getByDisplayValue("Bolt"), "x{Enter}");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Invalid input: name too long", variant: "destructive" }),
    );
    expect(screen.getByDisplayValue("Boltx")).toBeInTheDocument();
  });

  const conflict = { error: "Name taken", code: "nameConflict", existingId: "m3", existingName: "Core", existingAssetCount: 1, existingStockCount: 0 };

  async function renameBoltToCore() {
    await userEvent.click(screen.getByRole("button", { name: "renameItem(Bolt)" }));
    const input = screen.getByDisplayValue("Bolt");
    await userEvent.clear(input);
    await userEvent.type(input, "Core");
    await userEvent.click(screen.getByRole("button", { name: "saveName" }));
    return screen.findByRole("alertdialog");
  }

  it("offers a merge on a name conflict and merges into the existing manufacturer", async () => {
    mockFetch
      .mockResolvedValueOnce(json(conflict, false, 409))
      .mockResolvedValueOnce(json({ assetsMoved: 0, stockItemsMoved: 2 }));
    renderClient();
    const dialog = await renameBoltToCore();
    expect(within(dialog).getByText("mergeTitle")).toBeInTheDocument();
    expect(within(dialog).getByText("mergeDescription(Bolt)")).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "mergeSubmit" }));
    await waitFor(() => expect(names()).toEqual(["Acme", "Core"]));
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("/api/manufacturers/m2/merge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ targetId: "m3" });
    expect(mockToast).toHaveBeenCalledWith({ title: "manufacturerMerged", description: "mergeSummary(0,2)" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();
  });

  it("keeps the list when the merge fails", async () => {
    mockFetch
      .mockResolvedValueOnce(json(conflict, false, 409))
      .mockResolvedValueOnce(json({ error: "Merge failed" }, false, 500));
    renderClient();
    const dialog = await renameBoltToCore();
    await userEvent.click(within(dialog).getByRole("button", { name: "mergeSubmit" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Merge failed", variant: "destructive" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Core")).toBeInTheDocument();
    expect(names()).toEqual(["Acme", "Core"]);
  });

  it("cancels the merge offer without merging", async () => {
    mockFetch.mockResolvedValueOnce(json(conflict, false, 409));
    renderClient();
    const dialog = await renameBoltToCore();
    await userEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("deletes an unused manufacturer after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem(Bolt)" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText('Delete "Bolt"?')).toBeInTheDocument();
    expect(within(dialog).getByText("deleteConfirmDescription")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));

    await waitFor(() => expect(names()).toEqual(["Acme", "Core"]));
    expect(mockFetch).toHaveBeenCalledWith("/api/manufacturers/m2", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "manufacturerDeleted" });
  });

  it("blocks deleting a manufacturer that still has assets", async () => {
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem(Acme)" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/used by 2 asset\(s\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "delete" })).toBeDisabled();
  });

  it("toasts a delete error and keeps the manufacturer", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "In use" }, false, 409));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem(Bolt)" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "In use", variant: "destructive" }),
    );
    expect(names()).toEqual(["Acme", "Bolt", "Core"]);
  });

  it("resyncs when the initial list prop changes", () => {
    const { rerender } = renderClient([ACME]);
    rerender(<ManufacturersClient initialManufacturers={[BOLT]} />);
    expect(names()).toEqual(["Bolt"]);
  });
});
