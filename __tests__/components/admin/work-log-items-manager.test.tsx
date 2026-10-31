import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
}));
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { WorkLogItemsManager, type WorkLogItem } from "@/components/admin/work-log-items-manager";

const CLEAN: WorkLogItem = { id: "w1", name: "Cleaning", description: "Dust the filters", _count: { workLogs: 3 } };
const PATCH: WorkLogItem = { id: "w2", name: "Patching", description: null, _count: { workLogs: 0 } };

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function names() {
  return screen.getAllByText(/^(Cleaning|Patching|Audit|Zapping)$/).map((el) => el.textContent);
}

function renderManager(items = [CLEAN, PATCH]) {
  return render(<WorkLogItemsManager initialItems={items} />);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockToast.mockReset();
});

describe("WorkLogItemsManager", () => {
  it("shows the empty state", () => {
    renderManager([]);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("lists items with their description and usage count", () => {
    renderManager();
    expect(names()).toEqual(["Cleaning", "Patching"]);
    expect(screen.getByText("Dust the filters")).toBeInTheDocument();
    expect(screen.getByText("entryCount(3)")).toBeInTheDocument();
    expect(screen.queryByText("entryCount(0)")).not.toBeInTheDocument();
  });

  it("disables Add until a non-blank name is typed", async () => {
    renderManager();
    const add = screen.getByRole("button", { name: "add" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "  ");
    expect(add).toBeDisabled();
  });

  it("adds an item with a trimmed description and keeps the list sorted", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "w3", name: "Audit", description: "Yearly", _count: { workLogs: 0 } }));
    renderManager();
    const name = screen.getByPlaceholderText("namePlaceholder");
    const description = screen.getByPlaceholderText("descriptionPlaceholder");
    await userEvent.type(name, " Audit ");
    await userEvent.type(description, " Yearly ");
    await userEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(names()).toEqual(["Audit", "Cleaning", "Patching"]));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/work-log-items");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Audit", description: "Yearly" });
    expect(name).toHaveValue("");
    expect(description).toHaveValue("");
    expect(mockToast).toHaveBeenCalledWith({ title: "added" });
  });

  it("sends a blank description as null and toasts an API error", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Name already exists" }, false, 409));
    renderManager();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "Cleaning");
    await userEvent.type(screen.getByPlaceholderText("descriptionPlaceholder"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Name already exists", variant: "destructive" }),
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: "Cleaning", description: null });
    expect(screen.getByPlaceholderText("namePlaceholder")).toHaveValue("Cleaning");
  });

  it("falls back to a generic message when the API gives no error text", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("network down"));
    renderManager();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "Audit");
    await userEvent.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" }),
    );
    expect(screen.getByRole("button", { name: "add" })).toBeEnabled();
  });

  it("edits an item's name and description, re-sorting the list", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "w1", name: "Zapping", description: null }));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "editAriaLabel(Cleaning)" }));
    const name = screen.getByDisplayValue("Cleaning");
    const description = screen.getByDisplayValue("Dust the filters");
    await userEvent.clear(name);
    await userEvent.type(name, " Zapping ");
    await userEvent.clear(description);
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(names()).toEqual(["Patching", "Zapping"]));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/work-log-items/w1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ name: "Zapping", description: null });
    expect(screen.queryByText("Dust the filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith({ title: "updated" });
    // The usage count is kept from the list, not taken from the PUT response.
    expect(screen.getByText("entryCount(3)")).toBeInTheDocument();
  });

  it("starts editing an item without description with an empty textarea", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "w2", name: "Patching", description: "Monthly" }));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "editAriaLabel(Patching)" }));
    expect(screen.getByDisplayValue("Patching")).toBeInTheDocument();
    const textareas = screen.getAllByPlaceholderText("descriptionPlaceholder");
    const editDescription = textareas[textareas.length - 1];
    expect(editDescription).toHaveValue("");
    await userEvent.type(editDescription, "Monthly");
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByText("Monthly")).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: "Patching", description: "Monthly" });
  });

  it("ignores saving a blank name and cancels editing", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "editAriaLabel(Cleaning)" }));
    await userEvent.clear(screen.getByDisplayValue("Cleaning"));
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    expect(mockFetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(names()).toEqual(["Cleaning", "Patching"]);
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
  });

  it("toasts an edit error and stays in edit mode", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid input", details: ["name too long"] }, false, 400));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "editAriaLabel(Patching)" }));
    await userEvent.type(screen.getByDisplayValue("Patching"), "!");
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Invalid input: name too long", variant: "destructive" }),
    );
    expect(screen.getByDisplayValue("Patching!")).toBeInTheDocument();
  });

  it("deletes an unused item after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "deleteAriaLabel(Patching)" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("deleteTitle(Patching)")).toBeInTheDocument();
    expect(within(dialog).getByText("deleteUnused")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));

    await waitFor(() => expect(names()).toEqual(["Cleaning"]));
    expect(mockFetch).toHaveBeenCalledWith("/api/work-log-items/w2", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "deleted" });
  });

  it("warns about usage before deleting a used item and toasts a delete error", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Delete failed" }, false, 500));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "deleteAriaLabel(Cleaning)" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("deleteUsed(3)")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Delete failed", variant: "destructive" }),
    );
    expect(names()).toEqual(["Cleaning", "Patching"]);
  });
});
