import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) => (values?.name ? `${key}:${values.name}` : key);
  t.rich = (key: string) => key;
  return { useTranslations: () => t };
});
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/components/admin/template-overrides-editor", () => ({
  TemplateOverridesEditor: ({ kind }: { kind: string }) => <div>overrides-{kind}</div>,
}));
vi.mock("@/components/admin/maintenance-presets-manager", () => ({
  MaintenancePresetsManager: () => <div>presets</div>,
}));
vi.mock("@/components/admin/asset-drilldown-dialog", () => ({
  AssetDrilldownDialog: ({ source, onClose }: { source: { name: string; url: string } | null; onClose: () => void }) =>
    source ? (
      <div>
        <span>drilldown {source.url}</span>
        <button onClick={onClose}>close drilldown</button>
      </div>
    ) : null,
}));

import { AssetTypesClient } from "@/components/admin/asset-types-client";

type Type = Parameters<typeof AssetTypesClient>[0]["initialTypes"][number];
const ALPHA: Type = {
  id: "t1",
  name: "Alpha",
  scrapeTargetTemplate: null,
  prometheusExposed: true,
  hostnamePattern: null,
  defaultCriticality: null,
  _count: { assets: 0 },
};
const BETA: Type = {
  id: "t2",
  name: "Beta",
  scrapeTargetTemplate: "__address__=x",
  prometheusExposed: false,
  hostnamePattern: "^bt-",
  defaultCriticality: "HIGH",
  _count: { assets: 2 },
};

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function renderTypes(types: Type[] = [ALPHA, BETA]) {
  return render(<AssetTypesClient initialTypes={types} manufacturers={[]} />);
}

function lastCall() {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined };
}

async function expand(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Show scrape config for ${name}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssetTypesClient", () => {
  it("shows the empty state", () => {
    renderTypes([]);
    expect(screen.getByText("emptyList")).toBeInTheDocument();
  });

  it("shows badges for asset count, template, pattern and Prometheus exclusion", () => {
    renderTypes([ALPHA, BETA, { ...ALPHA, id: "t3", name: "Gamma", _count: { assets: 1 } }]);
    expect(screen.getByText("2 assets")).toBeInTheDocument();
    expect(screen.getByText("1 asset")).toBeInTheDocument();
    expect(screen.getAllByText("scrapeConfigured")).toHaveLength(1);
    expect(screen.getAllByText("hostnamePatternConfigured")).toHaveLength(1);
    expect(screen.getAllByText("prometheusExposedDisabled")).toHaveLength(1);
  });

  it("opens and closes the asset drilldown for a type in use", async () => {
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "viewAssetsOfType:Beta" }));
    expect(screen.getByText("drilldown /api/asset-types/t2/assets")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "close drilldown" }));
    expect(screen.queryByText(/drilldown \//)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("2 assets"));
    expect(screen.getByText("drilldown /api/asset-types/t2/assets")).toBeInTheDocument();
  });

  it("adds a type with Enter and keeps the list sorted", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...ALPHA, id: "t9", name: "Aardvark" }));
    renderTypes();
    const input = screen.getByPlaceholderText("namePlaceholder");
    await userEvent.type(input, "  Aardvark  {Enter}");
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "typeCreated" }));
    expect(lastCall()).toEqual({ url: "/api/asset-types", method: "POST", body: { name: "Aardvark" } });
    expect(input).toHaveValue("");
    const names = screen.getAllByText(/^(Aardvark|Alpha|Beta)$/).map((el) => el.textContent);
    expect(names).toEqual(["Aardvark", "Alpha", "Beta"]);
  });

  it("does not add a blank name", async () => {
    renderTypes();
    expect(screen.getByRole("button", { name: "add" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "   {Enter}");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("toasts the API error when adding fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Name taken" }, false, 409));
    renderTypes();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "Alpha");
    await userEvent.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Name taken", variant: "destructive" })
    );
    expect(screen.getByPlaceholderText("namePlaceholder")).toHaveValue("Alpha");
  });

  it("renames a type", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...ALPHA, name: "Zeta" }));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    const input = screen.getByDisplayValue("Alpha");
    await userEvent.clear(input);
    await userEvent.type(input, "Zeta");
    await userEvent.click(screen.getByRole("button", { name: "saveName" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "typeUpdated" }));
    expect(lastCall()).toEqual({ url: "/api/asset-types/t1", method: "PUT", body: { name: "Zeta" } });
    expect(screen.queryByDisplayValue("Zeta")).not.toBeInTheDocument();
    const names = screen.getAllByText(/^(Zeta|Beta)$/).map((el) => el.textContent);
    expect(names).toEqual(["Beta", "Zeta"]);
  });

  it("ignores a blank rename and cancels with Escape or the cancel button", async () => {
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    const input = screen.getByDisplayValue("Alpha");
    await userEvent.clear(input);
    await userEvent.type(input, "{Enter}");
    expect(mockFetch).not.toHaveBeenCalled();
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "cancelRename" }));
    expect(screen.queryByRole("button", { name: "saveName" })).not.toBeInTheDocument();
  });

  it("toasts a non-conflict rename error and stays in edit mode", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Boom" }, false, 500));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    await userEvent.type(screen.getByDisplayValue("Alpha"), "x{Enter}");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Boom", variant: "destructive" })
    );
    expect(screen.getByDisplayValue("Alphax")).toBeInTheDocument();
    expect(screen.queryByText("mergeConflictTitle")).not.toBeInTheDocument();
  });

  it("offers a merge on a name conflict and merges into the existing type", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ error: "exists", code: "nameConflict", existingId: "t2", existingName: "Beta" }, false, 409))
      .mockResolvedValueOnce(json({ assetsMoved: 3, stockItemsMoved: 1 }));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    const input = screen.getByDisplayValue("Alpha");
    await userEvent.clear(input);
    await userEvent.type(input, "Beta{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("mergeConflictTitle")).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "mergeConflictMerge" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "typeMerged", description: "mergeSummary" })
    );
    expect(lastCall()).toEqual({ url: "/api/asset-types/t1/merge", method: "POST", body: { targetId: "t2" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("toasts a failed merge and leaves the type in rename mode", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ code: "nameConflict", existingId: "t2", existingName: "Beta" }, false, 409))
      .mockResolvedValueOnce(json({ error: "Merge failed" }, false, 500));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    await userEvent.type(screen.getByDisplayValue("Alpha"), "!{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "mergeConflictMerge" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Merge failed", variant: "destructive" })
    );
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "typeMerged" }));
    expect(screen.getByDisplayValue("Alpha!")).toBeInTheDocument();
  });

  it("closes the merge offer with change-name and keeps editing", async () => {
    mockFetch.mockResolvedValueOnce(json({ code: "nameConflict", existingId: "t2" }, false, 409));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "renameItem:Alpha" }));
    await userEvent.type(screen.getByDisplayValue("Alpha"), "!{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "mergeConflictChangeName" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Alpha!")).toBeInTheDocument();
  });

  it("deletes an unused type after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem:Alpha" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("deleteConfirmDescription")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "typeDeleted" }));
    expect(lastCall()).toEqual({ url: "/api/asset-types/t1", method: "DELETE", body: undefined });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("blocks deleting a type in use", async () => {
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem:Beta" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("typeInUse")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "delete" })).toBeDisabled();
  });

  it("toasts a delete error and keeps the type", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "In use" }, false, 409));
    renderTypes();
    await userEvent.click(screen.getByRole("button", { name: "deleteItem:Alpha" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "In use", variant: "destructive" })
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("expands and collapses the scrape config panel", async () => {
    renderTypes();
    const toggle = screen.getByRole("button", { name: "Show scrape config for Alpha" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide scrape config for Alpha" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("scrapeTemplateHelp")).toBeInTheDocument();
    expect(screen.getByText("overrides-manufacturer")).toBeInTheDocument();
    expect(screen.getByText("overrides-model")).toBeInTheDocument();
    expect(screen.getByText("presets")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide scrape config for Alpha" }));
    expect(screen.queryByText("presets")).not.toBeInTheDocument();
  });

  it("toggles Prometheus exposure", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...BETA, prometheusExposed: true }));
    renderTypes([BETA]);
    await expand("Beta");
    expect(screen.getByText("prometheusExposedDisabled")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "prometheusExposed" });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await waitFor(() => expect(screen.queryByText("prometheusExposedDisabled")).not.toBeInTheDocument());
    expect(lastCall()).toEqual({ url: "/api/asset-types/t2", method: "PUT", body: { prometheusExposed: true } });
    expect(screen.getByRole("checkbox", { name: "prometheusExposed" })).toBeChecked();
  });

  it("saves the default criticality and clears it back to none", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ ...ALPHA, defaultCriticality: "CRITICAL" }))
      .mockResolvedValueOnce(json({ ...ALPHA, defaultCriticality: null }));
    renderTypes([ALPHA]);
    await expand("Alpha");
    const select = screen.getByRole("combobox", { name: "defaultCriticality" });
    await userEvent.selectOptions(select, "CRITICAL");
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "defaultCriticalitySaved" }));
    expect(lastCall().body).toEqual({ defaultCriticality: "CRITICAL" });
    expect(select).toHaveValue("CRITICAL");
    await userEvent.selectOptions(select, "");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(lastCall().body).toEqual({ defaultCriticality: null });
    await waitFor(() => expect(select).toHaveValue(""));
  });

  it("does not toast success when saving the criticality fails", async () => {
    mockFetch.mockResolvedValueOnce(json({}, false, 500));
    renderTypes([ALPHA]);
    await expand("Alpha");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "defaultCriticality" }), "LOW");
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mockToast).not.toHaveBeenCalledWith({ title: "defaultCriticalitySaved" });
  });

  it("validates the hostname pattern live and refuses to save an invalid one", async () => {
    renderTypes([ALPHA]);
    await expand("Alpha");
    const save = screen.getByRole("button", { name: "save" });
    expect(save).toBeDisabled();
    const input = screen.getByPlaceholderText("hostnamePatternPlaceholder");
    await userEvent.type(input, "^ab");
    expect(screen.getByText("hostnamePatternValid")).toBeInTheDocument();
    await userEvent.type(input, "(");
    expect(screen.queryByText("hostnamePatternValid")).not.toBeInTheDocument();
    await userEvent.click(save);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "hostnamePatternInvalid", variant: "destructive" })
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("saves a hostname pattern", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...ALPHA, hostnamePattern: "^al-" }));
    renderTypes([ALPHA]);
    await expand("Alpha");
    await userEvent.type(screen.getByPlaceholderText("hostnamePatternPlaceholder"), "  ^al-  ");
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "hostnamePatternSaved" }));
    expect(lastCall()).toEqual({ url: "/api/asset-types/t1", method: "PUT", body: { hostnamePattern: "^al-" } });
    expect(screen.getByPlaceholderText("hostnamePatternPlaceholder")).toHaveValue("^al-");
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    expect(screen.getByText("hostnamePatternConfigured")).toBeInTheDocument();
  });

  it("clears a hostname pattern to null and keeps the draft when saving fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Nope" }, false, 400));
    renderTypes([BETA]);
    await expand("Beta");
    const input = screen.getByPlaceholderText("hostnamePatternPlaceholder");
    expect(input).toHaveValue("^bt-");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Nope", variant: "destructive" })
    );
    expect(lastCall().body).toEqual({ hostnamePattern: null });
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
  });

  it("shows an existing template and saves an edited one", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...BETA, scrapeTargetTemplate: "__address__=y" }));
    renderTypes([BETA]);
    await expand("Beta");
    expect(screen.getByText("__address__=x")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/scrapeTemplate — Beta/)).toBeInTheDocument();
    const textarea = within(dialog).getByRole("textbox");
    expect(textarea).toHaveValue("__address__=x");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "__address__=y");
    await userEvent.click(within(dialog).getByRole("button", { name: "save" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "scrapeTemplateSaved" }));
    expect(lastCall()).toEqual({ url: "/api/asset-types/t2", method: "PUT", body: { scrapeTargetTemplate: "__address__=y" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("__address__=y")).toBeInTheDocument();
  });

  it("refuses to save an invalid template", async () => {
    renderTypes([ALPHA]);
    await expand("Alpha");
    await userEvent.click(screen.getByRole("button", { name: "edit" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "no separator");
    await userEvent.click(within(dialog).getByRole("button", { name: "save" }));
    expect(mockToast).toHaveBeenCalledWith({
      title: "templateHasErrors",
      description: 'Line 1: Missing "=" separator — "no separator"',
      variant: "destructive",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clears the template with delete and saves null; keeps the dialog open on error", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Bad" }, false, 400));
    renderTypes([BETA]);
    await expand("Beta");
    await userEvent.click(screen.getByRole("button", { name: "edit" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));
    expect(within(dialog).getByRole("textbox")).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Bad", variant: "destructive" })
    );
    expect(lastCall().body).toEqual({ scrapeTargetTemplate: null });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the template dialog with cancel or Escape", async () => {
    renderTypes([ALPHA]);
    await expand("Alpha");
    await userEvent.click(screen.getByRole("button", { name: "edit" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "edit" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("resyncs when initialTypes changes", () => {
    const { rerender } = renderTypes([ALPHA]);
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    rerender(<AssetTypesClient initialTypes={[BETA]} manufacturers={[]} />);
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
