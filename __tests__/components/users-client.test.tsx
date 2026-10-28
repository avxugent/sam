import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string, values?: Record<string, unknown>) => (values?.name ? `${key}:${values.name}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { UsersClient } from "@/components/admin/users-client";

const ADA = {
  id: "u1",
  name: "Ada Admin",
  email: "ada@example.com",
  role: "ADMIN" as const,
  provider: "credentials",
  totpEnabled: false,
  mustChangePassword: false,
  twoFactorRequired: false,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const VIC = { ...ADA, id: "u2", name: "Vic Viewer", email: "vic@example.com", role: "VIEWER" as const };

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function renderUsers() {
  return render(<UsersClient initialUsers={[ADA, VIC]} currentUserId="u1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UsersClient", () => {
  it("marks the current user and offers no self-delete", () => {
    renderUsers();
    const adaRow = screen.getByText("Ada Admin").closest("tr")!;
    expect(within(adaRow).getByText("you")).toBeInTheDocument();
    expect(within(adaRow).queryByTitle("deleteUser")).not.toBeInTheDocument();
    expect(within(screen.getByText("Vic Viewer").closest("tr")!).getByTitle("deleteUser")).toBeInTheDocument();
  });

  it("rejects a short password on create without calling the API", async () => {
    renderUsers();
    await userEvent.click(screen.getByRole("button", { name: /addUser/ }));
    await userEvent.type(screen.getByLabelText(/name/), "New Person");
    await userEvent.type(screen.getByLabelText(/email/), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/), "short");
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    expect(await screen.findByText("passwordTooShort")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a user and adds it to the list", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...VIC, id: "u3", name: "Bea Builder", email: "bea@example.com" }));
    renderUsers();
    await userEvent.click(screen.getByRole("button", { name: /addUser/ }));
    await userEvent.type(screen.getByLabelText(/name/), "Bea Builder");
    await userEvent.type(screen.getByLabelText(/email/), "bea@example.com");
    await userEvent.type(screen.getByLabelText(/password/), "long-enough-1");
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(await screen.findByText("Bea Builder")).toBeInTheDocument();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/users");
    expect(JSON.parse(init.body)).toMatchObject({ name: "Bea Builder", email: "bea@example.com", role: "VIEWER", mustChangePassword: true });
    expect(mockToast).toHaveBeenCalledWith({ title: "userCreated" });
  });

  it("does not send an empty password when editing", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...VIC, name: "Vic Renamed" }));
    renderUsers();
    await userEvent.click(within(screen.getByText("Vic Viewer").closest("tr")!).getByTitle("editUser"));
    const name = screen.getByLabelText("name");
    await userEvent.clear(name);
    await userEvent.type(name, "Vic Renamed");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/users/u2");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ name: "Vic Renamed", email: "vic@example.com", role: "VIEWER" });
    expect(body).not.toHaveProperty("password");
  });

  it("deletes a user after confirmation, and shows the API error when it fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Cannot delete the last admin." }, false));
    renderUsers();
    await userEvent.click(within(screen.getByText("Vic Viewer").closest("tr")!).getByTitle("deleteUser"));
    await userEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Cannot delete the last admin." }))
    );
    expect(screen.getByText("Vic Viewer")).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    await userEvent.click(within(screen.getByText("Vic Viewer").closest("tr")!).getByTitle("deleteUser"));
    await userEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(screen.queryByText("Vic Viewer")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenLastCalledWith("/api/users/u2", { method: "DELETE" });
  });
});
