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

import { WorkLogFormDialog, type WorkLogAssetOption, type WorkLogUserOption, type WorkLogItemOption } from "@/components/locations/work-log-form-dialog";

const ASSETS: WorkLogAssetOption[] = [{ id: "a1", label: "XPS", typeId: "t1" }];
const USERS: WorkLogUserOption[] = [{ id: "u1", label: "Alice" }];
const ITEMS: WorkLogItemOption[] = [{ id: "wi1", name: "Review asset list", description: null }];

function renderDialog(mode: "create" | "edit" = "create", extra = {}) {
  return render(
    <WorkLogFormDialog mode={mode} locationId="l1" assets={ASSETS} users={USERS} items={ITEMS} currentUserId="u1" {...extra}>
      <button>Add entry</button>
    </WorkLogFormDialog>
  );
}
async function open() {
  renderDialog();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("<WorkLogFormDialog /> create", () => {
  it("opens on trigger click", async () => {
    await open();
    expect(screen.getAllByText("addEntry").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("blocks submit and shows a validation error when description is empty", async () => {
    const user = await open();
    // submit button is the footer addEntry button (second occurrence)
    const submit = screen.getAllByRole("button", { name: "addEntry" }).at(-1)!;
    await user.click(submit);
    expect(await screen.findByText("errDescriptionRequired")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/locations/l1/work-logs",
      expect.anything()
    );
  });

  it("POSTs to the work-logs endpoint on valid submit", async () => {
    const user = await open();
    await user.type(screen.getByLabelText(/description/i), "Replaced the fan");
    const submit = screen.getAllByRole("button", { name: "addEntry" }).at(-1)!;
    await user.click(submit);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/locations/l1/work-logs",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "entryCreated" })));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows a destructive toast on API error", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Boom" }) });
    const user = await open();
    await user.type(screen.getByLabelText(/description/i), "x");
    const submit = screen.getAllByRole("button", { name: "addEntry" }).at(-1)!;
    await user.click(submit);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Boom" }))
    );
  });
});

describe("<WorkLogFormDialog /> validation + presets", () => {
  it("rejects an invalid JIRA key format", async () => {
    const user = await open();
    await user.type(screen.getByLabelText(/description/i), "did work");
    await user.type(screen.getByPlaceholderText("AVT-123"), "lowercase-1");
    const submit = screen.getAllByRole("button", { name: "addEntry" }).at(-1)!;
    await user.click(submit);
    expect(await screen.findByText("errJiraKeyFormat")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith("/api/locations/l1/work-logs", expect.anything());
  });

  it("nulls assetId and jiraIssueKey in the payload when left blank", async () => {
    const user = await open();
    await user.type(screen.getByLabelText(/description/i), "no asset work");
    const submit = screen.getAllByRole("button", { name: "addEntry" }).at(-1)!;
    await user.click(submit);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body);
    expect(body.assetId).toBeNull();
    expect(body.jiraIssueKey).toBeNull();
  });
});

describe("<WorkLogFormDialog /> edit", () => {
  it("PUTs to /api/work-logs/:id and prefills the description", async () => {
    const user = userEvent.setup();
    render(
      <WorkLogFormDialog
        mode="edit"
        locationId="l1"
        workLogId="w9"
        initialData={{ assetId: null, performedById: "u1", performedAt: "2024-01-02", description: "old text", jiraIssueKey: null }}
        assets={ASSETS}
        users={USERS}
        items={ITEMS}
        currentUserId="u1"
      >
        <button>Edit</button>
      </WorkLogFormDialog>
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByDisplayValue("old text")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("/api/work-logs/w9", expect.objectContaining({ method: "PUT" }))
    );
  });
});
