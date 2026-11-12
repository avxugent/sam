import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { ApiKeysSettings, type ApiKeySummary } from "@/components/settings/api-keys-settings";

const KEY: ApiKeySummary = { id: "k1", label: "Laptop", keyPrefix: "sam_mcp_abcd", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, expiresAt: null };
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() });

beforeEach(() => vi.clearAllMocks());

describe("ApiKeysSettings", () => {
  it("lists existing keys by name and prefix, never a secret", () => {
    render(<ApiKeysSettings keys={[KEY]} />);
    expect(screen.getByText(/Laptop/)).toBeInTheDocument();
    expect(screen.getByText(/sam_mcp_abcd/)).toBeInTheDocument();
    expect(screen.getByText(/neverExpires/)).toBeInTheDocument();
  });

  it("says so when there are no keys", () => {
    render(<ApiKeysSettings keys={[]} />);
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("requires a name before calling the API", async () => {
    render(<ApiKeysSettings keys={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    expect(await screen.findByText(/too small|required|at least/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a key, shows it once, and hides it again on Done", async () => {
    mockFetch.mockResolvedValue(json(201, { ...KEY, id: "k2", label: "New", key: "sam_mcp_SECRET" }));
    render(<ApiKeysSettings keys={[]} />);
    await userEvent.type(screen.getByLabelText(/label/), "New");
    await userEvent.type(screen.getByLabelText("expiresInDays"), "30");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(await screen.findByDisplayValue("sam_mcp_SECRET")).toBeInTheDocument();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ label: "New", expiresInDays: 30 });
    expect(screen.getByText(/New/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "done" }));
    expect(screen.queryByDisplayValue("sam_mcp_SECRET")).not.toBeInTheDocument();
  });

  it("shows the server's error and adds nothing when creation fails", async () => {
    mockFetch.mockResolvedValue(json(409, { error: "too many" }));
    render(<ApiKeysSettings keys={[]} />);
    await userEvent.type(screen.getByLabelText(/label/), "New");
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("revokes a key after confirmation", async () => {
    mockFetch.mockResolvedValue(json(200, { ok: true }));
    render(<ApiKeysSettings keys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: /revoke Laptop/ }));
    await userEvent.click(screen.getByRole("button", { name: "revoke" }));
    await waitFor(() => expect(screen.getByText("none")).toBeInTheDocument());
    expect(mockFetch.mock.calls[0][0]).toBe("/api/users/me/api-keys/k1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});
