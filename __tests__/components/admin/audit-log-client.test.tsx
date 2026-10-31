import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { AuditLogClient } from "@/components/admin/audit-log-client";

type Log = Parameters<typeof AuditLogClient>[0]["initialLogs"][number];

const base: Log = {
  id: "l0",
  timestamp: "2026-01-01T10:00:00.000Z",
  userId: "u1",
  userEmail: "ada@example.com",
  action: "CREATE",
  entityType: "Asset",
  entityId: "a1",
  entityName: "Server One",
  detail: null,
  ipAddress: "10.0.0.1",
};

const LOGS: Log[] = [
  { ...base, id: "l1", detail: JSON.stringify({ changes: { hostname: { from: "old-host", to: "new-host" }, notes: { from: null, to: null } } }), action: "UPDATE", timestamp: "2026-01-03T10:00:00.000Z" },
  { ...base, id: "l2", userEmail: "bob@example.com", action: "DELETE", entityType: "Location", entityName: "Room 1", detail: JSON.stringify({ snapshot: { name: "Room 1", fiNumber: null } }), timestamp: "2026-01-02T10:00:00.000Z", ipAddress: null },
  { ...base, id: "l3", userEmail: null, action: "LOGIN_FAILED", entityType: "User", entityName: null, detail: "plain text detail", timestamp: "2026-01-01T10:00:00.000Z", ipAddress: "192.168.1.9" },
  { ...base, id: "l4", action: "CUSTOM", entityName: "Server Two", detail: JSON.stringify(42), timestamp: "2025-12-31T10:00:00.000Z" },
  { ...base, id: "l5", action: "EXPORT", entityName: "Dump", detail: JSON.stringify({ count: 3 }), timestamp: "2025-12-30T10:00:00.000Z" },
  { ...base, id: "l6", action: "CREATE", entityName: "No Detail", timestamp: "2025-12-29T10:00:00.000Z" },
];

// Rows with a detail carry role="button", so read the body rows from the table itself.
function bodyRows() {
  return Array.from(screen.getByRole("table").querySelector("tbody")!.rows);
}
function entityOrder() {
  return bodyRows().map((r) => r.cells[3]?.textContent ?? "");
}

describe("AuditLogClient", () => {
  it("lists every log newest first with the total count", () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
    expect(entityOrder()).toEqual([
      "Asset· Server One",
      "Location· Room 1",
      "User",
      "Asset· Server Two",
      "Asset· Dump",
      "Asset· No Detail",
    ]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("system")).toBeInTheDocument();
    expect(within(table).getByText("UPDATE")).toBeInTheDocument();
    expect(within(table).getByText("CUSTOM")).toBeInTheDocument();
  });

  it("shows the empty state when there are no logs", () => {
    render(<AuditLogClient initialLogs={[]} />);
    expect(screen.getByText("noLogs")).toBeInTheDocument();
    expect(screen.getByText("0 of 0")).toBeInTheDocument();
  });

  it("filters by search text over email, entity, action and IP", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    const search = screen.getByPlaceholderText("search…");
    await userEvent.type(search, "BOB@");
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
    expect(entityOrder()).toEqual(["Location· Room 1"]);

    await userEvent.clear(search);
    await userEvent.type(search, "192.168");
    expect(entityOrder()).toEqual(["User"]);

    await userEvent.clear(search);
    await userEvent.type(search, "login_failed");
    expect(entityOrder()).toEqual(["User"]);

    await userEvent.clear(search);
    await userEvent.type(search, "location");
    expect(entityOrder()).toEqual(["Location· Room 1"]);

    await userEvent.clear(search);
    await userEvent.type(search, "dump");
    expect(entityOrder()).toEqual(["Asset· Dump"]);

    await userEvent.clear(search);
    await userEvent.type(search, "nothing-matches");
    expect(screen.getByText("noLogs")).toBeInTheDocument();
  });

  it("filters by action and entity type, offering each distinct value once", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    const [actionSelect, entitySelect] = screen.getAllByRole("combobox");
    expect(within(actionSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "filterByAction", "CREATE", "CUSTOM", "DELETE", "EXPORT", "LOGIN_FAILED", "UPDATE",
    ]);
    expect(within(entitySelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "filterByEntity", "Asset", "Location", "User",
    ]);

    await userEvent.selectOptions(actionSelect, "CREATE");
    expect(entityOrder()).toEqual(["Asset· No Detail"]);

    await userEvent.selectOptions(actionSelect, "");
    await userEvent.selectOptions(entitySelect, "Location");
    expect(entityOrder()).toEqual(["Location· Room 1"]);
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
  });

  it("sorts by column, toggling direction on a second click", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    await userEvent.click(screen.getByRole("button", { name: "timestamp" }));
    expect(entityOrder()[0]).toBe("Asset· No Detail");
    expect(screen.getByRole("columnheader", { name: "timestamp" })).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(screen.getByRole("button", { name: "user" }));
    expect(entityOrder()[0]).toBe("User");
    await userEvent.click(screen.getByRole("button", { name: "user" }));
    expect(entityOrder()[0]).toBe("Location· Room 1");
    expect(screen.getByRole("columnheader", { name: "user" })).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(screen.getByRole("button", { name: "action" }));
    expect(bodyRows().map((r) => r.cells[2].textContent)).toEqual([
      "CREATE", "CUSTOM", "DELETE", "EXPORT", "LOGIN_FAILED", "UPDATE",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "entity" }));
    expect(entityOrder()).toEqual([
      "Asset· Dump", "Asset· No Detail", "Asset· Server One", "Asset· Server Two", "Location· Room 1", "User",
    ]);
  });

  it("expands a change diff on click and collapses it again", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    const row = screen.getByRole("button", { name: "showDetails UPDATE Asset" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("old-host")).toBeInTheDocument();
    expect(screen.getByText("new-host")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);

    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("old-host")).not.toBeInTheDocument();
  });

  it("expands with the keyboard and renders a snapshot table", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    const row = screen.getByRole("button", { name: "showDetails DELETE Location" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("fiNumber")).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(screen.queryByText("fiNumber")).not.toBeInTheDocument();
    await userEvent.keyboard("a");
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("renders non-JSON, primitive and plain-object details as text", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    await userEvent.click(screen.getByRole("button", { name: "showDetails LOGIN_FAILED User" }));
    expect(screen.getByText("plain text detail")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "showDetails CUSTOM Asset" }));
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("plain text detail")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "showDetails EXPORT Asset" }));
    expect(screen.getByText(/"count": 3/)).toBeInTheDocument();
  });

  it("does not make a log without detail expandable", async () => {
    render(<AuditLogClient initialLogs={LOGS} />);
    const row = screen.getByText("· No Detail").closest("tr")!;
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("aria-expanded");
    row.focus();
    await userEvent.type(row, "{Enter}");
    await userEvent.click(row);
    expect(bodyRows()).toHaveLength(LOGS.length);
  });
});
