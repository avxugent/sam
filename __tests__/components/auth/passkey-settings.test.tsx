import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/auth/enrollment-api", () => ({ registerPasskey: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));

import { registerPasskey } from "@/components/auth/enrollment-api";
import { startAuthentication } from "@simplewebauthn/browser";
import { PasskeySettings, type PasskeySummary } from "@/components/auth/passkey-settings";

const KEY: PasskeySummary = { id: "pk1", label: "YubiKey", deviceType: "singleDevice", backedUp: false, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null };
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PasskeySettings", () => {
  it("renders nothing for SSO accounts", () => {
    const { container } = render(<PasskeySettings provider="microsoft-entra-id" totpEnabled={false} passkeys={[KEY]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("registers a passkey with the given label", async () => {
    vi.mocked(registerPasskey).mockResolvedValue({ ok: true });
    render(<PasskeySettings provider="credentials" totpEnabled={false} passkeys={[]} />);
    expect(screen.getByText("passkeyNone")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /passkeyAdd/ }));
    await userEvent.type(screen.getByLabelText("passkeyLabel"), "Laptop");
    await userEvent.click(screen.getAllByRole("button", { name: /passkeyAdd/ }).at(-1)!);
    expect(registerPasskey).toHaveBeenCalledWith("Laptop");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("explains a cancelled browser prompt", async () => {
    vi.mocked(registerPasskey).mockResolvedValue({ ok: false, cancelled: true, error: "NotAllowedError" });
    render(<PasskeySettings provider="credentials" totpEnabled={false} passkeys={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /passkeyAdd/ }));
    await userEvent.click(screen.getAllByRole("button", { name: /passkeyAdd/ }).at(-1)!);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "passkeyCancelled" })));
  });

  it("removes a passkey after confirming with the current TOTP code", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    render(<PasskeySettings provider="credentials" totpEnabled passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    expect(screen.getByRole("button", { name: "passkeyRemove" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("twoFactorCurrentCode"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove" }));
    await waitFor(() => expect(screen.queryByText("YubiKey")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/passkey/pk1", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ code: "123456" }) }));
  });

  it("removes a passkey after confirming with a passkey assertion", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ options: { challenge: "c" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.mocked(startAuthentication).mockResolvedValue({ id: "cred1" } as never);
    render(<PasskeySettings provider="credentials" totpEnabled={false} passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    expect(screen.queryByLabelText("twoFactorCurrentCode")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemoveWithPasskey" }));
    await waitFor(() => expect(screen.queryByText("YubiKey")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/passkey/confirmation-options", { method: "POST" });
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(mockFetch).toHaveBeenLastCalledWith("/api/auth/passkey/pk1", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ response: { id: "cred1" } }) }));
  });

  it("keeps the passkey when the passkey prompt is cancelled", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ options: { challenge: "c" } })));
    vi.mocked(startAuthentication).mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    render(<PasskeySettings provider="credentials" totpEnabled={false} passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemoveWithPasskey" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "passkeyCancelled" })));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("YubiKey")).toBeInTheDocument();
  });

  it("keeps the passkey and shows the error when removal fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Confirmation failed." }), { status: 400 }));
    render(<PasskeySettings provider="credentials" totpEnabled passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    await userEvent.type(screen.getByLabelText("twoFactorCurrentCode"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Confirmation failed." })));
    expect(screen.getByText("YubiKey")).toBeInTheDocument();
  });
});
