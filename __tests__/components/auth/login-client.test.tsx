import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: vi.fn() }));

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { LoginClient } from "@/components/auth/login-client";

function renderLogin(callbackUrl: string | null = null, ssoEnabled = false) {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(callbackUrl ? { callbackUrl } : {}) as never);
  return render(<LoginClient ssoEnabled={ssoEnabled} />);
}

async function submit() {
  await userEvent.type(screen.getByLabelText("email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("password"), "hunter22");
  await userEvent.click(screen.getByRole("button", { name: "signIn" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginClient", () => {
  it("signs in with credentials and goes to the callback URL", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    renderLogin("/locations/l1");
    await submit();
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "ada@example.com", password: "hunter22", redirect: false });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/locations/l1"));
  });

  it.each(["https://evil.example/", "//evil.example/x"])("never redirects off-site (%s)", async (callbackUrl) => {
    vi.mocked(signIn).mockResolvedValue({ error: undefined } as never);
    renderLogin(callbackUrl);
    await submit();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });

  it("shows an error for rejected credentials and stays on the page", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: "CredentialsSignin" } as never);
    renderLogin();
    await submit();
    expect(await screen.findByText("invalidCredentials")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("offers Entra ID sign-in only when SSO is enabled", async () => {
    renderLogin(null, false);
    expect(screen.queryByRole("button", { name: /signInWithEntra/ })).not.toBeInTheDocument();
  });

  it("starts the Entra ID flow with the sanitized callback", async () => {
    renderLogin("/reports", true);
    await userEvent.click(screen.getByRole("button", { name: /signInWithEntra/ }));
    expect(signIn).toHaveBeenCalledWith("microsoft-entra-id", { callbackUrl: "/reports" });
  });
});
