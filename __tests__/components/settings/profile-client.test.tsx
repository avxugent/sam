import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const setTheme = vi.fn();
vi.mock("@/components/layout/theme-provider", () => ({ useTheme: () => ({ theme: "light", setTheme }) }));

import { ProfileClient } from "@/components/settings/profile-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const ok = () => new Response("{}");
const body = (call = 0) => JSON.parse(mockFetch.mock.calls[call][1].body);

function renderProfile(provider = "credentials") {
  return render(<ProfileClient name="Ada" email="ada@example.com" provider={provider} locationDefaultTab="sublocations" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileClient", () => {
  it("saves the display name", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderProfile();
    const name = screen.getByLabelText(/name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Ada L.");
    await userEvent.click(screen.getAllByRole("button", { name: "save" })[0]);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "profileSaved" }));
    expect(body()).toEqual({ name: "Ada L." });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("changes the password and validates it first", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderProfile();
    await userEvent.type(screen.getByLabelText(/currentPassword/), "old-pass");
    await userEvent.type(screen.getByLabelText(/newPassword/), "short");
    await userEvent.type(screen.getByLabelText(/confirmPassword/), "short");
    const save = screen.getAllByRole("button", { name: "save" })[1];
    await userEvent.click(save);
    expect(await screen.findByText("passwordTooShort")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/newPassword/));
    await userEvent.type(screen.getByLabelText(/newPassword/), "new-password-1");
    await userEvent.clear(screen.getByLabelText(/confirmPassword/));
    await userEvent.type(screen.getByLabelText(/confirmPassword/), "new-password-1");
    await userEvent.click(save);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "passwordChanged" }));
    expect(body()).toEqual({ currentPassword: "old-pass", newPassword: "new-password-1", confirmPassword: "new-password-1" });
  });

  it("hides the password form for SSO accounts", () => {
    renderProfile("microsoft-entra-id");
    expect(screen.queryByLabelText(/currentPassword/)).not.toBeInTheDocument();
  });

  it("applies the theme at once and saves it", async () => {
    mockFetch.mockResolvedValueOnce(ok());
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: /themeDark/ }));
    expect(setTheme).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "preferencesSaved" }));
    expect(body()).toEqual({ theme: "dark" });
  });

  it("shows the API error when saving fails, and a network failure too", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Name too long." }), { status: 400 }));
    renderProfile();
    await userEvent.click(screen.getAllByRole("button", { name: "save" })[0]);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Name too long." })));

    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getAllByRole("button", { name: "save" })[0]);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "somethingWentWrong" })));
  });
});
