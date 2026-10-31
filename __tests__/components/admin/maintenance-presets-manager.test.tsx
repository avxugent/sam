import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string, values?: Record<string, unknown>) => (values?.name ? `${key}:${values.name}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { MaintenancePresetsManager } from "@/components/admin/maintenance-presets-manager";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

const LAMP = { id: "p1", name: "Replace lamp", description: "Use the spare in the cabinet" };
const FILTER = { id: "p2", name: "Clean filter", description: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MaintenancePresetsManager", () => {
  it("loads and lists the presets of the asset type", async () => {
    mockFetch.mockResolvedValueOnce(json([LAMP, FILTER]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    expect(screen.getByText("Loading presets…")).toBeInTheDocument();
    expect(await screen.findByText("Replace lamp")).toBeInTheDocument();
    expect(screen.getByText("Use the spare in the cabinet")).toBeInTheDocument();
    expect(screen.getByText("Clean filter")).toBeInTheDocument();
    expect(mockFetch.mock.calls[0][0]).toBe("/api/asset-types/t1/presets");
  });

  it("shows the empty state when loading fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "nope" }, false, 500));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    expect(await screen.findByText("No presets yet")).toBeInTheDocument();
  });

  it("disables adding until a name is typed", async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    const add = await screen.findByRole("button", { name: /Add preset/ });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("newPresetPlaceholder"), "   ");
    expect(add).toBeDisabled();
  });

  it("adds a trimmed preset, keeps the list sorted and clears the inputs", async () => {
    mockFetch.mockResolvedValueOnce(json([LAMP]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    await screen.findByText("Replace lamp");

    mockFetch.mockResolvedValueOnce(json({ id: "p3", name: "Check fan", description: "Listen for noise" }));
    const name = screen.getByPlaceholderText("newPresetPlaceholder");
    const desc = screen.getByPlaceholderText("presetDescPlaceholder");
    await userEvent.type(name, "  Check fan  ");
    await userEvent.type(desc, " Listen for noise ");
    await userEvent.click(screen.getByRole("button", { name: /Add preset/ }));

    expect(await screen.findByText("Check fan")).toBeInTheDocument();
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("/api/asset-types/t1/presets");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Check fan", description: "Listen for noise" });
    expect(mockToast).toHaveBeenCalledWith({ title: "presetAdded" });
    expect(name).toHaveValue("");
    expect(desc).toHaveValue("");

    const names = screen.getAllByText(/^(Check fan|Replace lamp)$/).map((el) => el.textContent);
    expect(names).toEqual(["Check fan", "Replace lamp"]);
  });

  it("sends a null description when it is blank", async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    mockFetch.mockResolvedValueOnce(json(FILTER));
    await userEvent.type(await screen.findByPlaceholderText("newPresetPlaceholder"), "Clean filter");
    await userEvent.click(screen.getByRole("button", { name: /Add preset/ }));
    await screen.findByText("Clean filter");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ name: "Clean filter", description: null });
  });

  it("toasts the API error when adding fails and keeps the input", async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    mockFetch.mockResolvedValueOnce(json({ error: "Preset exists" }, false, 409));
    const name = await screen.findByPlaceholderText("newPresetPlaceholder");
    await userEvent.type(name, "Clean filter");
    await userEvent.click(screen.getByRole("button", { name: /Add preset/ }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Preset exists", variant: "destructive" })
    );
    expect(name).toHaveValue("Clean filter");
    expect(screen.getByText("No presets yet")).toBeInTheDocument();
  });

  it("deletes a preset", async () => {
    mockFetch.mockResolvedValueOnce(json([LAMP, FILTER]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    await userEvent.click(await screen.findByRole("button", { name: "deletePresetNamed:Replace lamp" }));
    await waitFor(() => expect(screen.queryByText("Replace lamp")).not.toBeInTheDocument());
    expect(screen.getByText("Clean filter")).toBeInTheDocument();
    expect(mockFetch.mock.calls[1][0]).toBe("/api/asset-types/presets/p1");
    expect(mockFetch.mock.calls[1][1]).toEqual({ method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "presetDeleted" });
  });

  it("keeps the preset and toasts a fallback message when deleting fails", async () => {
    mockFetch.mockResolvedValueOnce(json([LAMP]));
    render(<MaintenancePresetsManager assetTypeId="t1" />);
    mockFetch.mockRejectedValueOnce(new Error("network"));
    await userEvent.click(await screen.findByRole("button", { name: "deletePresetNamed:Replace lamp" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" })
    );
    expect(screen.getByText("Replace lamp")).toBeInTheDocument();
  });
});
