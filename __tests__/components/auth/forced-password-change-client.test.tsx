import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { signOut } from "next-auth/react";
import { ForcedPasswordChangeClient } from "@/components/auth/forced-password-change-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByLabelText("currentPassword"), current);
  await userEvent.type(screen.getByLabelText("newPassword"), next);
  await userEvent.type(screen.getByLabelText("confirmPassword"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /changePassword|setNewPassword|save/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForcedPasswordChangeClient", () => {
  it("changes the password, then signs out for a clean session", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}"));
    render(<ForcedPasswordChangeClient />);
    await fill("old-pass", "new-password-1", "new-password-1");
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/users/me");
    expect(JSON.parse(init.body)).toEqual({ currentPassword: "old-pass", newPassword: "new-password-1", confirmPassword: "new-password-1" });
  });

  it("validates before calling the API", async () => {
    render(<ForcedPasswordChangeClient />);
    await fill("old-pass", "short", "short");
    expect(await screen.findByText("passwordTooShort")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows a mismatch", async () => {
    render(<ForcedPasswordChangeClient />);
    await fill("old-pass", "new-password-1", "new-password-2");
    expect(await screen.findByText("passwordMismatch")).toBeInTheDocument();
  });

  it("shows the API error and stays signed in", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Current password is incorrect." }), { status: 400 }));
    render(<ForcedPasswordChangeClient />);
    await fill("wrong", "new-password-1", "new-password-1");
    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
