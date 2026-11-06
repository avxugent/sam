import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/auth/enrollment-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/auth/enrollment-api")>()),
  requestTotpSetup: vi.fn(),
  confirmTotpSetup: vi.fn(),
  registerPasskey: vi.fn(),
}));

import { confirmTotpSetup, registerPasskey, requestTotpSetup } from "@/components/auth/enrollment-api";
import { Forced2FASetupClient } from "@/components/auth/forced-2fa-setup-client";

beforeEach(() => {
  vi.clearAllMocks();
  // The success paths navigate with window.location.href, which jsdom only logs.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Forced2FASetupClient", () => {
  it("enrols TOTP and continues into the app with a full navigation", async () => {
    vi.mocked(requestTotpSetup).mockResolvedValue({ ok: true, qrCodeDataUrl: "data:,qr", secret: "S" });
    vi.mocked(confirmTotpSetup).mockResolvedValue({ ok: true });
    render(<Forced2FASetupClient />);
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupTitle/ }));
    expect(await screen.findByAltText("twoFactorQrAlt")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("twoFactorEnterAppCode"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));

    expect(await screen.findByText("twoFactorEnabled")).toBeInTheDocument();
    expect(confirmTotpSetup).toHaveBeenCalledWith("123456");
  });

  it("stays on the code step after a wrong code", async () => {
    vi.mocked(requestTotpSetup).mockResolvedValue({ ok: true, qrCodeDataUrl: "data:,qr", secret: "S" });
    vi.mocked(confirmTotpSetup).mockResolvedValue({ ok: false, error: "Invalid code." });
    render(<Forced2FASetupClient />);
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupTitle/ }));
    await userEvent.type(await screen.findByLabelText("twoFactorEnterAppCode"), "000000");
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Invalid code." })));
    expect(screen.queryByText("twoFactorEnabled")).not.toBeInTheDocument();
    expect(screen.getByLabelText("twoFactorEnterAppCode")).toHaveValue("");
  });

  it("enrols a passkey instead, and explains a cancelled prompt", async () => {
    vi.mocked(registerPasskey).mockResolvedValueOnce({ ok: false, cancelled: true, error: "" }).mockResolvedValueOnce({ ok: true });
    render(<Forced2FASetupClient />);
    await userEvent.click(screen.getByRole("button", { name: /passkeyUseInstead/ }));
    await userEvent.click(screen.getByRole("button", { name: /passkeySetupTitle/ }));
    expect(await screen.findByText("passkeyCancelled")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /passkeySetupTitle/ }));
    expect(await screen.findByText("twoFactorEnabled")).toBeInTheDocument();
  });
});
