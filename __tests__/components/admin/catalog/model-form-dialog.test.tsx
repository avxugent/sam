import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: vi.fn(),
}));

import { ModelFormDialog } from "@/components/admin/catalog/model-form-dialog";
import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const TYPES = [{ id: "t1", name: "Laptop" }, { id: "t2", name: "Desktop" }];
const MANUFACTURERS = [{ id: "mf1", name: "Dell" }, { id: "mf2", name: "HP" }];
const NEW = { id: null, typeId: "", manufacturerId: null, name: "", documentationUrl: null };
const EXISTING = { id: "m1", typeId: "t1", manufacturerId: "mf1", name: "Latitude", documentationUrl: "https://docs.example.com" };

function renderDialog(initial: Parameters<typeof ModelFormDialog>[0]["initial"] = NEW) {
  const props = { onClose: vi.fn(), onSaved: vi.fn(), onMergeConflict: vi.fn() };
  render(<ModelFormDialog initial={initial} assetTypes={TYPES} manufacturers={MANUFACTURERS} {...props} />);
  return props;
}

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

const body = (call: number) => JSON.parse(mockApiFetch.mock.calls[call][1]!.body as string);

beforeEach(() => vi.clearAllMocks());

describe("ModelFormDialog create", () => {
  it("titles the dialog and keeps save disabled until a type and name are set", async () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "newModel" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "save" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "XPS");
    expect(save).toBeDisabled();
    await pick(screen.getAllByRole("combobox")[0], "Laptop");
    expect(save).toBeEnabled();
  });

  it("POSTs the trimmed model and reports it saved", async () => {
    const saved = { id: "m9", typeId: "t2", manufacturerId: "mf2", name: "Elite", documentationUrl: "https://hp.example" };
    mockApiFetch.mockResolvedValue({ ok: true, status: 201, data: saved });
    const props = renderDialog();
    const [typeBox, manufacturerBox] = screen.getAllByRole("combobox");
    await pick(typeBox, "Desktop");
    await pick(manufacturerBox, "HP");
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "  Elite  ");
    await userEvent.type(screen.getByPlaceholderText("documentationUrlPlaceholder"), " https://hp.example ");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(saved));
    expect(mockApiFetch.mock.calls[0][0]).toBe("/api/models");
    expect(mockApiFetch.mock.calls[0][1]!.method).toBe("POST");
    expect(body(0)).toEqual({ typeId: "t2", manufacturerId: "mf2", name: "Elite", documentationUrl: "https://hp.example" });
  });

  it("shows the API error and never offers a merge on create", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: "Name taken", code: "nameConflict", existingId: "m2" },
    });
    const props = renderDialog({ ...NEW, typeId: "t1", name: "Dup" });
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "error", description: "Name taken", variant: "destructive" })),
    );
    expect(props.onMergeConflict).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });
});

describe("ModelFormDialog edit", () => {
  it("PUTs the edited model, sending a cleared manufacturer and URL as null", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: { ...EXISTING, manufacturerId: null, documentationUrl: null } });
    const props = renderDialog(EXISTING);
    expect(screen.getByRole("heading", { name: "editModel" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("namePlaceholder")).toHaveValue("Latitude");
    await pick(screen.getAllByRole("combobox")[1], "noManufacturer");
    await userEvent.clear(screen.getByPlaceholderText("documentationUrlPlaceholder"));
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0][0]).toBe("/api/models/m1");
    expect(mockApiFetch.mock.calls[0][1]!.method).toBe("PUT");
    expect(body(0)).toEqual({ typeId: "t1", manufacturerId: null, name: "Latitude", documentationUrl: null });
  });

  it("hands a rename conflict to onMergeConflict instead of toasting", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: "Name taken", code: "nameConflict", existingId: "m2", existingName: "Latitude 2", existingAssetCount: 3, existingStockCount: 1 },
    });
    const props = renderDialog(EXISTING);
    const name = screen.getByPlaceholderText("namePlaceholder");
    await userEvent.clear(name);
    await userEvent.type(name, "Latitude 2");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(props.onMergeConflict).toHaveBeenCalledWith({
        editingId: "m1",
        newName: "Latitude 2",
        existingId: "m2",
        existingName: "Latitude 2",
        existingAssetCount: 3,
        existingStockCount: 1,
      }),
    );
    expect(mockToast).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("toasts other errors on edit", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, error: {} });
    renderDialog(EXISTING);
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "somethingWentWrong" })),
    );
  });

  it("shows a spinner and disables save while saving", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof apiFetch>>) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderDialog(EXISTING);
    const save = screen.getByRole("button", { name: "save" });
    await userEvent.click(save);
    expect(save).toBeDisabled();
    expect(save.querySelector(".animate-spin")).not.toBeNull();
    resolve({ ok: true, status: 200, data: EXISTING });
    await waitFor(() => expect(save).toBeEnabled());
  });

  it("closes on cancel", async () => {
    const props = renderDialog(EXISTING);
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(props.onClose).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const props = renderDialog(EXISTING);
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalled();
  });
});
