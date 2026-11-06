import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/auth/enrollment-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/auth/enrollment-api")>()),
  requestTotpSetup: vi.fn(),
  confirmTotpSetup: vi.fn(),
}));

import { confirmTotpSetup, requestTotpSetup } from "@/components/auth/enrollment-api";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TwoFactorSettings", () => {
  it("defers to Entra ID for SSO accounts", () => {
    render(<TwoFactorSettings provider="microsoft-entra-id" totpEnabled={false} />);
    expect(screen.getByText("twoFactorSsoManaged")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /twoFactorSetupConfirm/ })).not.toBeInTheDocument();
  });

  it("sets up TOTP: QR code, then a valid code enables it", async () => {
    vi.mocked(requestTotpSetup).mockResolvedValue({ ok: true, qrCodeDataUrl: "data:image/png;base64,QR", secret: "JBSWY3DP" });
    vi.mocked(confirmTotpSetup).mockResolvedValue({ ok: true });
    render(<TwoFactorSettings provider="credentials" totpEnabled={false} />);

    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));
    expect(await screen.findByAltText("twoFactorQrAlt")).toHaveAttribute("src", "data:image/png;base64,QR");
    await userEvent.type(screen.getByLabelText("twoFactorEnterAppCode"), "12a3456");
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));

    expect(confirmTotpSetup).toHaveBeenCalledWith("123456");
    expect(await screen.findByText("twoFactorNowActiveTitle")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps the setup open and clears the code when it is wrong", async () => {
    vi.mocked(requestTotpSetup).mockResolvedValue({ ok: true, qrCodeDataUrl: "data:,", secret: "S" });
    vi.mocked(confirmTotpSetup).mockResolvedValue({ ok: false, error: "Invalid code." });
    render(<TwoFactorSettings provider="credentials" totpEnabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));
    const input = await screen.findByLabelText("twoFactorEnterAppCode");
    await userEvent.type(input, "000000");
    await userEvent.click(screen.getByRole("button", { name: /twoFactorSetupConfirm/ }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "twoFactorInvalid", description: "Invalid code." })));
    expect(input).toHaveValue("");
  });

  it("disables TOTP after confirming with a current code", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}"));
    render(<TwoFactorSettings provider="credentials" totpEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /twoFactorDisableTitle/ }));
    await userEvent.type(screen.getByLabelText("twoFactorCurrentCode"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "twoFactorDisable" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "twoFactorDisabled" }));
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/2fa/disable", expect.objectContaining({ body: JSON.stringify({ code: "654321" }) }));
    expect(screen.getByText("twoFactorBadgeDisabled")).toBeInTheDocument();
  });

  it("stays enabled when the disable code is rejected", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid code." }), { status: 400 }));
    render(<TwoFactorSettings provider="credentials" totpEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /twoFactorDisableTitle/ }));
    await userEvent.type(screen.getByLabelText("twoFactorCurrentCode"), "111111");
    await userEvent.click(screen.getByRole("button", { name: "twoFactorDisable" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Invalid code." })));
    expect(screen.getByText("twoFactorBadgeEnabled")).toBeInTheDocument();
  });
});
