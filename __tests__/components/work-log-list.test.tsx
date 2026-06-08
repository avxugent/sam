import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

import { WorkLogList, type WorkLogEntry } from "@/components/locations/work-log-list";

function entry(over: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id: "w1",
    performedAt: "2024-03-10T00:00:00Z",
    description: "Replaced power supply",
    jiraIssueKey: null,
    performedBy: { id: "u1", name: "Alice Smith", email: "alice@x.com" },
    item: null,
    asset: { id: "a1", model: "XPS", serialNumber: "SN1", hostname: null, type: { id: "t1", name: "Laptop" } },
    ...over,
  };
}

function renderList(entries: WorkLogEntry[], props: Record<string, unknown> = {}) {
  return render(
    <WorkLogList
      locationId="l1"
      entries={entries}
      assets={[{ id: "a1", label: "XPS", typeId: "t1" }]}
      users={[{ id: "u1", label: "Alice" }]}
      items={[]}
      currentUserId="u1"
      userRole="ADMIN"
      jiraBaseUrl={null}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("<WorkLogList />", () => {
  it("renders an entry with author, description and asset link", () => {
    renderList([entry()]);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Replaced power supply")).toBeInTheDocument();
    expect(screen.getByText("XPS")).toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", () => {
    renderList([]);
    expect(screen.getByText("noEntries")).toBeInTheDocument();
  });

  it("filters entries by the search box", async () => {
    const user = userEvent.setup();
    renderList([entry(), entry({ id: "w2", description: "Cleaned filters", asset: null })]);
    await user.type(screen.getByLabelText("searchPlaceholder"), "power");
    expect(screen.getByText("Replaced power supply")).toBeInTheDocument();
    expect(screen.queryByText("Cleaned filters")).not.toBeInTheDocument();
  });

  it("shows the no-search-results state", async () => {
    const user = userEvent.setup();
    renderList([entry()]);
    await user.type(screen.getByLabelText("searchPlaceholder"), "zzz");
    expect(screen.getByText("noSearchResults")).toBeInTheDocument();
  });

  it("deletes an entry through the confirm dialog", async () => {
    const user = userEvent.setup();
    renderList([entry()]);
    await user.click(screen.getByLabelText(/deleteEntry/));
    await user.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/work-logs/w1", { method: "DELETE" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "entryDeleted" })));
  });

  it("hides modify actions for entries authored by others when not admin", () => {
    renderList([entry({ performedBy: { id: "u2", name: "Bob", email: "bob@x.com" } })], { userRole: "EDITOR", currentUserId: "u1" });
    expect(screen.queryByLabelText(/deleteEntry/)).toBeNull();
  });
});
